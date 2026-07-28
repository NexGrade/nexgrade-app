import { Router, type Request } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { escolasTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// RF-BILLING: recebe eventos assíncronos do Stripe (pagamento
// confirmado, assinatura cancelada, etc.) e mantém a escola em dia
// com o que realmente aconteceu na cobrança -- diferente do checkout
// (que só INICIA o pagamento), aqui é onde a gente sabe de verdade se
// deu certo.
//
// IMPORTANTE: esta rota é montada em app.ts ANTES do express.json() e
// FORA do requireAuth -- o Stripe não manda token Clerk (não faz
// sentido, quem chama é o servidor do Stripe, não um usuário logado) e
// a verificação de assinatura abaixo (stripe.webhooks.constructEvent)
// exige o corpo CRU da requisição, não o JSON já interpretado. Ver
// comentário em app.ts onde essa rota é montada com express.raw().
const router = Router();

router.post("/", async (req: Request, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeSecretKey) {
    // Falha FECHADA de propósito -- sem o segredo configurado não dá
    // pra confirmar que o evento realmente veio do Stripe (qualquer um
    // poderia forjar uma requisição dizendo "paguei", liberando acesso
    // de graça). Melhor recusar tudo do que processar sem verificar.
    console.error("STRIPE_WEBHOOK_SECRET ou STRIPE_SECRET_KEY não configurados -- webhook recusado.");
    res.status(500).json({ error: "Webhook não configurado no servidor." });
    return;
  }

  const stripe = new Stripe(stripeSecretKey);
  const assinatura = req.headers["stripe-signature"];

  let event: Stripe.Event;
  try {
    // req.body precisa ser o Buffer cru aqui (express.raw()), não JSON
    // já parseado -- é isso que permite verificar a assinatura.
    event = stripe.webhooks.constructEvent(req.body as Buffer, assinatura as string, webhookSecret);
  } catch (err) {
    console.error("Assinatura do webhook Stripe inválida:", err instanceof Error ? err.message : err);
    res.status(400).json({ error: "Assinatura inválida." });
    return;
  }

  try {
    switch (event.type) {
      // Pagamento confirmado pela primeira vez -- liga a assinatura à
      // escola que iniciou o checkout (client_reference_id).
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const escolaId = session.client_reference_id;
        const planoIdStr = session.metadata?.planoId;
        if (!escolaId || !planoIdStr) {
          console.error("checkout.session.completed sem client_reference_id ou metadata.planoId -- ignorado.", session.id);
          break;
        }
        await db.update(escolasTable)
          .set({
            stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
            planoId: Number(planoIdStr),
            planoAtivo: true,
            updatedAt: new Date(),
          })
          .where(eq(escolasTable.id, escolaId));
        console.log(`Escola ${escolaId}: assinatura ativada via checkout (plano ${planoIdStr}).`);
        break;
      }

      // Cobrança recorrente confirmada/recusada, plano trocado,
      // cancelamento agendado -- reflete o status atual da assinatura.
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const escola = await db.select().from(escolasTable)
          .where(eq(escolasTable.stripeSubscriptionId, subscription.id))
          .then((r) => r[0]);
        if (!escola) {
          console.error(`Assinatura Stripe ${subscription.id} não corresponde a nenhuma escola conhecida -- ignorado.`);
          break;
        }
        const ativa = subscription.status === "active" || subscription.status === "trialing";
        await db.update(escolasTable)
          .set({ planoAtivo: ativa, updatedAt: new Date() })
          .where(eq(escolasTable.id, escola.id));
        console.log(`Escola ${escola.id}: assinatura ${subscription.status} -- planoAtivo=${ativa}.`);
        break;
      }

      default:
        // Outros eventos (fatura gerada, tentativa de cobrança falhou
        // isoladamente, etc.) -- não tratados por enquanto, mas o
        // Stripe precisa de 200 mesmo assim pra não ficar reenviando.
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Erro ao processar webhook Stripe:", err instanceof Error ? err.message : err);
    // 500 aqui faz o Stripe tentar reenviar o evento depois -- correto
    // quando o erro é nosso (ex: banco fora do ar), não do Stripe.
    res.status(500).json({ error: "Erro ao processar evento." });
  }
});

export default router;
