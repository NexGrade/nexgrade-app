import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  escolasTable, planosTable, professoresTable, turmasTable,
  horariosTable, aiMensagensTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { isMaster, requireMaster } from "../middlewares/requireMaster";
import { registrarAuditoria } from "../lib/audit";
import { cancelarSubscription } from "../lib/asaas";

// RF-MASTER-01 a RF-MASTER-03: cadastro/ativação de escolas, gestão de
// planos, métricas de uso da plataforma. Ver requireMaster.ts para como
// o acesso é controlado (allowlist de userId, fora do isolamento por
// escola de propósito).
const router = Router();

// Único endpoint deste arquivo que QUALQUER usuário autenticado pode
// chamar (não passa por requireMaster) — é assim que o frontend decide
// se mostra o link "Painel Master" no menu, sem expor nenhum dado.
router.get("/whoami", (req, res) => {
  res.json({ isMaster: isMaster(req) });
});

router.use(requireMaster);

const EscolaUpdateInput = z.object({
  planoId: z.number().int().nullable().optional(),
  planoAtivo: z.boolean().optional(),
  // [NOVO] Isenta a escola de qualquer bloqueio por trial vencido/sem
  // assinatura ativa -- uso pontual (ex: escola piloto), não faz parte
  // do fluxo normal de cadastro.
  isenta: z.boolean().optional(),
  // [NOVO] RF-BILLING-ASAAS: editável pelo Master pra escolas que não
  // preencheram no onboarding (ex: cadastradas antes desse campo
  // existir) -- sem isso, a rota de assinatura Asaas fica bloqueada.
  emailContato: z.string().email().nullable().optional(),
  telefoneContato: z.string().nullable().optional(),
  emailCobranca: z.string().email().nullable().optional(),
});

const PlanoInput = z.object({
  nome: z.string().min(1),
  precoMensal: z.number().int().min(0).default(0),
  precoAnual: z.number().int().min(0).nullable().optional(),
  maxProfessores: z.number().int().min(1).default(10),
  maxTurmas: z.number().int().min(1).default(5),
  temIA: z.boolean().default(false),
  temExport: z.boolean().default(false),
  temImport: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

// ── ESCOLAS ──────────────────────────────────────────────────────────────────

router.get("/escolas", async (_req, res) => {
  const escolas = await db.select().from(escolasTable).orderBy(escolasTable.createdAt);
  const planos = await db.select().from(planosTable);

  const comMetricas = await Promise.all(
    escolas.map(async (escola) => {
      const [totalProfessores, totalTurmas] = await Promise.all([
        db.select({ n: count() }).from(professoresTable).where(eq(professoresTable.escolaId, escola.id)).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(turmasTable).where(eq(turmasTable.escolaId, escola.id)).then((r) => r[0]?.n ?? 0),
      ]);
      return {
        ...escola,
        plano: planos.find((p) => p.id === escola.planoId) ?? null,
        totalProfessores,
        totalTurmas,
      };
    }),
  );

  res.json(comMetricas);
});

router.patch("/escolas/:id", async (req, res) => {
  const id = req.params.id!;
  const parsed = EscolaUpdateInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const anterior = await db.select().from(escolasTable).where(eq(escolasTable.id, id)).then((r) => r[0]);
  if (!anterior) {
    res.status(404).json({ error: "Escola não encontrada" });
    return;
  }

  const [escola] = await db.update(escolasTable).set(parsed.data).where(eq(escolasTable.id, id)).returning();

  // Auditoria fica registrada sob a própria escola afetada — visível
  // tanto pro Master quanto pela tela de auditoria da escola.
  await registrarAuditoria({
    req, escolaId: id, entidade: "escolas", entidadeId: 0,
    acao: "alteracao", dadosAnteriores: anterior, dadosNovos: escola,
  });

  res.json(escola);
});

// POST /escolas/:id/cancelar-assinatura-asaas — cancela a assinatura
// no Asaas (chamada de API real, igual ao botão "Cancelar" do Nex
// Reserva) e reflete o cancelamento no banco. Diferente de só marcar
// planoAtivo=false: se não cancelar no Asaas também, ele continua
// gerando cobrança todo ciclo.
router.post("/escolas/:id/cancelar-assinatura-asaas", async (req, res) => {
  const id = req.params.id!;
  const escola = await db.select().from(escolasTable).where(eq(escolasTable.id, id)).then((r) => r[0]);
  if (!escola) {
    res.status(404).json({ error: "Escola não encontrada" });
    return;
  }
  if (!escola.asaasSubscriptionId) {
    res.status(400).json({ error: "Esta escola não tem assinatura Asaas ativa." });
    return;
  }

  try {
    await cancelarSubscription(escola.asaasSubscriptionId);
  } catch (err) {
    console.error("Erro ao cancelar assinatura no Asaas:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Não foi possível cancelar a assinatura no Asaas. Tente novamente." });
    return;
  }

  const [atualizada] = await db.update(escolasTable)
    .set({ planoAtivo: false, asaasStatusAssinatura: "cancelada", updatedAt: new Date() })
    .where(eq(escolasTable.id, id))
    .returning();

  await registrarAuditoria({
    req, escolaId: id, entidade: "escolas", entidadeId: 0,
    acao: "alteracao", dadosAnteriores: escola, dadosNovos: atualizada,
  });

  res.json(atualizada);
});

// ── PLANOS ───────────────────────────────────────────────────────────────────

router.get("/planos", async (_req, res) => {
  const planos = await db.select().from(planosTable).orderBy(planosTable.precoMensal);
  res.json(planos);
});

router.post("/planos", async (req, res) => {
  const parsed = PlanoInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [plano] = await db.insert(planosTable).values(parsed.data).returning();
  res.status(201).json(plano);
});

router.patch("/planos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = PlanoInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [plano] = await db.update(planosTable).set(parsed.data).where(eq(planosTable.id, id)).returning();
  if (!plano) {
    res.status(404).json({ error: "Plano não encontrado" });
    return;
  }
  res.json(plano);
});

// ── MÉTRICAS DA PLATAFORMA (RF-MASTER-03) ───────────────────────────────────

router.get("/metrics", async (_req, res) => {
  const [
    escolas, professores, turmas, horarios, mensagensIA, totalContasClerk,
  ] = await Promise.all([
    db.select().from(escolasTable),
    db.select({ n: count() }).from(professoresTable).then((r) => r[0]?.n ?? 0),
    db.select({ n: count() }).from(turmasTable).then((r) => r[0]?.n ?? 0),
    db.select({ n: count() }).from(horariosTable).then((r) => r[0]?.n ?? 0),
    db.select({ n: count() }).from(aiMensagensTable).where(eq(aiMensagensTable.role, "user")).then((r) => r[0]?.n ?? 0),
    // [FIX] "totalUsuarios" contava a tabela `usuarios` -- que não é
    // "quem acessa a plataforma", é uma feature separada de convidar
    // colegas de trabalho pra uma escola (tela "Usuários" no menu de
    // Sistema), opcional e raramente usada. Isso fazia a métrica
    // mostrar "0" mesmo com contas reais logando via Clerk todo dia.
    // clerkClient.users.getCount() conta as contas de verdade.
    clerkClient.users.getCount(),
  ]);

  const hoje = new Date();
  const escolasEmTrial = escolas.filter((e) => e.trialEndsAt && new Date(e.trialEndsAt) > hoje).length;
  const escolasAtivas = escolas.filter((e) => e.planoAtivo).length;
  const escolasInativas = escolas.length - escolasAtivas;

  res.json({
    totalEscolas: escolas.length,
    escolasAtivas,
    escolasInativas,
    escolasEmTrial,
    totalProfessores: professores,
    totalTurmas: turmas,
    totalAulasDistribuidas: horarios,
    totalUsuarios: totalContasClerk,
    mensagensEnviadasParaIA: mensagensIA,
  });
});

export default router;
