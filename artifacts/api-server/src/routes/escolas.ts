import { Router } from "express";
import { db } from "@workspace/db";
import { escolasTable, planosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { limitadorCadastro } from "../middlewares/rateLimit";

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
  const { nomeFantasia, cnpj, cidade, estado, modalidade } = req.body;

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

export default router;
