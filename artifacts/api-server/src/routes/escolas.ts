import { Router } from "express";
import { db } from "@workspace/db";
import { escolasTable, planosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { limitadorCadastro } from "../middlewares/rateLimit";
import { criarOuReaproveitarCustomer, criarSubscription } from "../lib/asaas";

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
router.post("/", limitadorCadastro, async (req, res) => {
  const escolaId = getEscolaId(req);
  const { nomeFantasia, cnpj, cidade, estado, modalidade, emailContato, telefoneContato, emailCobranca, codigoInep, nre, turnosOfertados, resolucaoSeedPr } = req.body;

  if (!nomeFantasia?.trim()) {
    res.status(400).json({ error: "Nome da escola obrigatório" });
    return;
  }

  const existing = await db.select().from(escolasTable).where(eq(escolasTable.id, escolaId)).then(r => r[0]);

  // RNF-SEG: CNPJ obrigatório só em CADASTRO NOVO -- dificulta cadastro
  // descartável/em massa sem barrar quem já tinha conta antes dessa
  // exigência existir (não força CNPJ retroativamente em quem já
  // estava usando o sistema sem esse dado preenchido).
  if (!existing && !cnpj?.trim()) {
    res.status(400).json({ error: "CNPJ é obrigatório para cadastrar uma escola nova." });
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

  if (existing) {
    const [updated] = await db
      .update(escolasTable)
      .set({
        nomeFantasia, cnpj, cidade, estado: estado ?? "SP", modalidade: modalidade ?? "regular",
        emailContato: emailContato ?? existing.emailContato,
        telefoneContato: telefoneContato ?? existing.telefoneContato,
        emailCobranca: emailCobranca ?? existing.emailCobranca,
        codigoInep: codigoInep ?? existing.codigoInep,
        nre: nre ?? existing.nre,
        turnosOfertados: turnosOfertados ?? existing.turnosOfertados,
        resolucaoSeedPr: resolucaoSeedPr ?? existing.resolucaoSeedPr,
        updatedAt: new Date(),
      })
      .where(eq(escolasTable.id, escolaId))
      .returning();
    res.json(updated);
  } else {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);
    const [created] = await db
      .insert(escolasTable)
      .values({
        id: escolaId, nomeFantasia, cnpj, cidade, estado: estado ?? "SP", modalidade: modalidade ?? "regular",
        emailContato, telefoneContato, emailCobranca, codigoInep, nre, turnosOfertados, resolucaoSeedPr,
        planoId, planoAtivo: true, trialEndsAt,
      })
      .returning();
    res.status(201).json(created);
  }
});

// POST /escolas/assinatura-asaas — cria (ou reaproveita) o Customer no
// Asaas e abre uma Subscription pro plano escolhido. O Asaas notifica
// a escola automaticamente por e-mail/WhatsApp com o boleto/PIX da
// primeira cobrança -- não há tela de pagamento hospedada aqui, ao
// contrário do antigo checkout do Stripe.
const AssinaturaInput = z.object({
  planoId: z.number().int(),
  periodicidade: z.enum(["mensal", "anual"]),
});

router.post("/assinatura-asaas", limitadorCadastro, async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = AssinaturaInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { planoId, periodicidade } = parsed.data;

  const escola = await db.select().from(escolasTable).where(eq(escolasTable.id, escolaId)).then(r => r[0]);
  if (!escola) {
    res.status(400).json({ error: "Complete o cadastro da escola antes de assinar um plano." });
    return;
  }
  if (!escola.cnpj?.trim()) {
    res.status(400).json({ error: "CNPJ da escola é obrigatório para gerar a cobrança." });
    return;
  }
  if (!escola.emailCobranca?.trim() && !escola.emailContato?.trim() && !escola.telefoneContato?.trim()) {
    res.status(400).json({ error: "Cadastre um e-mail de cobrança (ou ao menos um contato) antes de assinar um plano." });
    return;
  }
  // RF-BILLING-ASAAS: prioriza o e-mail específico de cobrança sobre o
  // e-mail de contato geral -- nem sempre é a mesma caixa de entrada
  // que recebe boleto e que atende a secretaria no dia a dia.
  const emailParaAsaas = escola.emailCobranca?.trim() || escola.emailContato?.trim() || undefined;

  const plano = await db.select().from(planosTable).where(eq(planosTable.id, planoId)).then(r => r[0]);
  if (!plano) {
    res.status(404).json({ error: "Plano não encontrado" });
    return;
  }

  const valorReais = periodicidade === "anual"
    ? (plano.precoAnual ?? plano.precoMensal * 12) / 100
    : plano.precoMensal / 100;
  if (valorReais <= 0) {
    res.status(400).json({ error: `O plano "${plano.nome}" não tem preço configurado para cobrança.` });
    return;
  }

  try {
    let asaasCustomerId = escola.asaasCustomerId;
    if (!asaasCustomerId) {
      const customer = await criarOuReaproveitarCustomer({
        name: escola.nomeFantasia,
        cpfCnpj: escola.cnpj,
        email: emailParaAsaas,
        mobilePhone: escola.telefoneContato ?? undefined,
        externalReference: escola.id,
      });
      asaasCustomerId = customer.id;
    }

    const proximoVencimento = new Date();
    proximoVencimento.setDate(proximoVencimento.getDate() + 7);

    const subscription = await criarSubscription({
      customer: asaasCustomerId,
      value: valorReais,
      cycle: periodicidade === "anual" ? "YEARLY" : "MONTHLY",
      nextDueDate: proximoVencimento.toISOString().slice(0, 10),
      description: `NexGrade — Plano ${plano.nome} (${periodicidade === "anual" ? "anual" : "mensal"})`,
      externalReference: escola.id,
    });

    await db.update(escolasTable)
      .set({
        asaasCustomerId,
        asaasSubscriptionId: subscription.id,
        planoId,
        updatedAt: new Date(),
      })
      .where(eq(escolasTable.id, escolaId));

    res.json({
      mensagem: "Assinatura criada. A escola vai receber o boleto/PIX por e-mail ou WhatsApp em instantes.",
      asaasSubscriptionId: subscription.id,
    });
  } catch (err) {
    console.error("Erro ao criar assinatura no Asaas:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Não foi possível criar a assinatura. Tente novamente em instantes." });
  }
});

export default router;
