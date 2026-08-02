import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { escolasTable, asaasWebhookEventosTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// RF-BILLING-ASAAS: recebe eventos de COBRANÇA do Asaas (não existe
// webhook nativo de assinatura -- ver eventos-para-assinaturas na doc
// do Asaas). Cada cobrança que pertence a uma assinatura carrega o
// campo `subscription` com o ID dela, é assim que ligamos o evento à
// escola certa.
//
// IMPORTANTE: montada FORA do requireAuth em app.ts -- quem chama essa
// rota é o servidor do Asaas, não um usuário logado com sessão Clerk.
// A autenticidade é garantida pelo header customizado abaixo (definido
// como `authToken` na hora de criar o Webhook no painel do Asaas), não
// por assinatura HMAC como no Stripe.
const router = Router();

type AsaasWebhookPayload = {
  id: string;
  event: string;
  payment?: {
    id: string;
    subscription?: string;
    customer: string;
    status: string;
    dueDate: string; // "YYYY-MM-DD" -- data de vencimento desta cobrança
  };
};

router.post("/", async (req: Request, res) => {
  const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!tokenEsperado) {
    console.error("ASAAS_WEBHOOK_TOKEN não configurado -- webhook recusado.");
    res.status(500).json({ error: "Webhook não configurado no servidor." });
    return;
  }

  const tokenRecebido = req.headers["asaas-access-token"];
  if (tokenRecebido !== tokenEsperado) {
    console.error("Token do webhook Asaas inválido.");
    res.status(401).json({ error: "Token inválido." });
    return;
  }

  const payload = req.body as AsaasWebhookPayload;

  // Idempotência: se este `id` de evento já foi processado, confirma
  // 200 sem reprocessar -- o Asaas reenvia o mesmo evento às vezes.
  const jaProcessado = await db
    .select()
    .from(asaasWebhookEventosTable)
    .where(eq(asaasWebhookEventosTable.id, payload.id))
    .then((r) => r.length > 0);
  if (jaProcessado) {
    res.json({ received: true, duplicado: true });
    return;
  }

  try {
    const subscriptionId = payload.payment?.subscription;

    if (subscriptionId) {
      const escola = await db
        .select()
        .from(escolasTable)
        .where(eq(escolasTable.asaasSubscriptionId, subscriptionId))
        .then((r) => r[0]);

      if (!escola) {
        console.error(`Assinatura Asaas ${subscriptionId} não corresponde a nenhuma escola conhecida -- ignorado.`);
      } else {
        switch (payload.event) {
          // Nova cobrança gerada pro próximo ciclo -- atualiza a data
          // de vencimento exibida no Painel Master. Status vira
          // "pendente" só se ainda não tinha nenhum (assinatura nova);
          // se já estava "em_dia" de um ciclo anterior, mantém até a
          // confirmação ou o vencimento desta nova cobrança.
          case "PAYMENT_CREATED":
            await db.update(escolasTable)
              .set({
                asaasProximoVencimento: new Date(payload.payment!.dueDate),
                asaasStatusAssinatura: escola.asaasStatusAssinatura ?? "pendente",
                updatedAt: new Date(),
              })
              .where(eq(escolasTable.id, escola.id));
            console.log(`Escola ${escola.id}: nova cobrança gerada, vence em ${payload.payment?.dueDate}.`);
            break;

          // Cobrança confirmada (Boleto/PIX compensados) ou recebida
          // -- ativa a escola e marca a assinatura como em dia.
          case "PAYMENT_CONFIRMED":
          case "PAYMENT_RECEIVED":
            await db.update(escolasTable)
              .set({ planoAtivo: true, asaasStatusAssinatura: "em_dia", updatedAt: new Date() })
              .where(eq(escolasTable.id, escola.id));
            console.log(`Escola ${escola.id}: cobrança confirmada -- planoAtivo=true.`);
            break;

          // Cobrança vencida sem pagamento -- não desativa
          // automaticamente (dá margem pro atraso de boleto/PIX
          // compensar), mas já reflete "Atrasada" no Painel Master.
          // Ajustar aqui se decidir bloquear automaticamente após N
          // dias de atraso.
          case "PAYMENT_OVERDUE":
            await db.update(escolasTable)
              .set({ asaasStatusAssinatura: "atrasada", updatedAt: new Date() })
              .where(eq(escolasTable.id, escola.id));
            console.log(`Escola ${escola.id}: cobrança vencida (${payload.payment?.id}).`);
            break;

          // Cobrança removida (ex: assinatura cancelada) -- desativa.
          case "PAYMENT_DELETED":
            await db.update(escolasTable)
              .set({ planoAtivo: false, asaasStatusAssinatura: "cancelada", updatedAt: new Date() })
              .where(eq(escolasTable.id, escola.id));
            console.log(`Escola ${escola.id}: cobrança removida -- planoAtivo=false.`);
            break;

          default:
            // Outros eventos (PAYMENT_UPDATED, etc.) -- não tratados
            // por enquanto.
            break;
        }
      }
    }

    await db.insert(asaasWebhookEventosTable).values({ id: payload.id, tipo: payload.event });
    res.json({ received: true });
  } catch (err) {
    console.error("Erro ao processar webhook Asaas:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Erro ao processar evento." });
  }
});

export default router;
