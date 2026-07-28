import { Router } from "express";
import { db } from "@workspace/db";
import { escolasTable, planosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";
import { getEscolaId } from "../lib/escola-id";

// URL do frontend, usada nos redirecionamentos de volta do Stripe
// (sucesso/cancelamento) -- variável de ambiente com fallback pro
// domínio real, seguindo o mesmo padrão de NOME_ESCOLA em routes/export.ts.
const FRONTEND_URL = process.env.FRONTEND_URL || "https://nexgrade.nexuscoretecnologia.com.br";

const router = Router();

// Planos SaaS pré-definidos
const PLANOS_SEED = [
  {
    nome: "Gratuito",
    precoMensal: 0,
    maxProfessores: 10,
    maxTurmas: 5,
    temIA: false,
    temExport: true,
    temImport: false,
  },
  {
    nome: "Pro",
    precoMensal: 9700, // R$ 97,00/mês em centavos
    precoAnual: 97000, // R$ 970,00/ano (10 meses -- 2 meses grátis)
    maxProfessores: 100,
    maxTurmas: 50,
    temIA: true,
    temExport: true,
    temImport: true,
  },
  {
    nome: "Master",
    precoMensal: 18000, // R$ 180,00/mês
    precoAnual: 180000, // R$ 1.800,00/ano (10 meses -- 2 meses grátis; posicionado perto do concorrente ~R$1.900/ano)
    maxProfessores: 9999,
    maxTurmas: 9999,
    temIA: true,
    temExport: true,
    temImport: true,
  },
];

// GET /escolas/planos — lista planos disponíveis (público)
router.get("/planos", async (_req, res) => {
  let planos = await db.select().from(planosTable).where(and(eq(planosTable.ativo, true), eq(planosTable.visivelPublicamente, true)));
  if (planos.length === 0) {
    // Seed planos se ainda não existem
    await db.insert(planosTable).values(PLANOS_SEED.map(p => ({ ...p, ativo: true })));
    planos = await db.select().from(planosTable).where(eq(planosTable.ativo, true));
  }
  res.json(planos);
});

// GET /escolas/me — dados da escola do usuário logado
router.get("/me", async (req, res) => {
  const escolaId = getEscolaId(req);
  const escola = await db
    .select()
    .from(escolasTable)
    .where(eq(escolasTable.id, escolaId))
    .then(r => r[0]);

  if (!escola) {
    res.json({ cadastrada: false });
    return;
  }

  let plano = null;
  if (escola.planoId) {
    plano = await db.select().from(planosTable).where(eq(planosTable.id, escola.planoId)).then(r => r[0]);
  }

  res.json({ ...escola, plano, cadastrada: true });
});

// POST /escolas — cria/atualiza escola (onboarding)
router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const { nomeFantasia, cnpj, cidade, estado, modalidade } = req.body;

  if (!nomeFantasia?.trim()) {
    res.status(400).json({ error: "Nome da escola obrigatório" });
    return;
  }

  // Busca plano gratuito
  let planoId: number | undefined;
  const planoGratuito = await db.select().from(planosTable).where(eq(planosTable.nome, "Gratuito")).then(r => r[0]);
  if (!planoGratuito) {
    const [p] = await db.insert(planosTable).values({ nome: "Gratuito", precoMensal: 0, maxProfessores: 10, maxTurmas: 5, temIA: false, temExport: true, temImport: false, ativo: true }).returning();
    planoId = p.id;
  } else {
    planoId = planoGratuito.id;
  }

  const existing = await db.select().from(escolasTable).where(eq(escolasTable.id, escolaId)).then(r => r[0]);
  if (existing) {
    const [updated] = await db
      .update(escolasTable)
      .set({ nomeFantasia, cnpj, cidade, estado: estado ?? "SP", modalidade: modalidade ?? "regular", updatedAt: new Date() })
      .where(eq(escolasTable.id, escolaId))
      .returning();
    res.json(updated);
  } else {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);
    const [created] = await db
      .insert(escolasTable)
      .values({ id: escolaId, nomeFantasia, cnpj, cidade, estado: estado ?? "SP", modalidade: modalidade ?? "regular", planoId, planoAtivo: true, trialEndsAt })
      .returning();
    res.status(201).json(created);
  }
});

// POST /escolas/checkout — inicia o pagamento de um plano pago no
// Stripe (RF-BILLING). Devolve a URL da página de pagamento hospedada
// pelo próprio Stripe; o front só precisa redirecionar pra lá.
const CheckoutInput = z.object({
  planoId: z.number().int(),
  periodicidade: z.enum(["mensal", "anual"]),
});

router.post("/checkout", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CheckoutInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { planoId, periodicidade } = parsed.data;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: "Pagamento não configurado no servidor. Contate o suporte." });
    return;
  }

  const plano = await db.select().from(planosTable).where(eq(planosTable.id, planoId)).then(r => r[0]);
  if (!plano) {
    res.status(404).json({ error: "Plano não encontrado" });
    return;
  }

  const priceId = periodicidade === "anual" ? plano.stripePriceIdAnual : plano.stripePriceIdMensal;
  if (!priceId) {
    res.status(400).json({ error: `O plano "${plano.nome}" ainda não tem preço ${periodicidade} configurado.` });
    return;
  }

  const escola = await db.select().from(escolasTable).where(eq(escolasTable.id, escolaId)).then(r => r[0]);
  if (!escola) {
    res.status(400).json({ error: "Complete o cadastro da escola antes de assinar um plano." });
    return;
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/planos?checkout=sucesso`,
      cancel_url: `${FRONTEND_URL}/planos?checkout=cancelado`,
      // Como o webhook (routes/stripe-webhook.ts) recebe o evento sem
      // sessão Clerk, é assim que ele sabe pra qual escola aplicar a
      // assinatura confirmada -- tanto no campo padrão do Checkout
      // quanto duplicado em metadata, por segurança/redundância.
      client_reference_id: escolaId,
      metadata: { escolaId, planoId: String(planoId), periodicidade },
      // Reaproveita o mesmo Customer no Stripe se a escola já tiver
      // um (ex: trocou de plano depois de já ter assinado antes) --
      // evita duplicar cliente no painel do Stripe.
      customer: escola.stripeCustomerId ?? undefined,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erro ao criar sessão de checkout Stripe:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Não foi possível iniciar o pagamento. Tente novamente em instantes." });
  }
});

export default router;
