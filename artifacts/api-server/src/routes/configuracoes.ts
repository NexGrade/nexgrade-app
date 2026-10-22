import { Router } from "express";
import { db } from "@workspace/db";
import { configuracoesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { CHAVES_REGRA_REDE } from "../lib/regras-rede"; // [REGRAS-REDE]

const router = Router();

const ConfiguracaoInput = z.object({
  valor: z.any(),
  descricao: z.string().optional(),
});

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const rows = await db.select().from(configuracoesTable)
    .where(eq(configuracoesTable.escolaId, escolaId))
    .orderBy(configuracoesTable.chave);
  res.json(rows);
});

router.get("/:chave", async (req, res) => {
  const escolaId = getEscolaId(req);
  const chave = req.params.chave;
  const row = await db.select().from(configuracoesTable)
    .where(and(eq(configuracoesTable.chave, chave), eq(configuracoesTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!row) {
    res.status(404).json({ error: "Configuração não encontrada" });
    return;
  }
  res.json(row);
});

router.put("/:chave", async (req, res) => {
  const escolaId = getEscolaId(req);
  const chave = req.params.chave;
  // [REGRAS-REDE] regra de geração da rede: igual para todas as escolas, não se grava por escola
  if (CHAVES_REGRA_REDE.has(chave)) {
    res.status(403).json({ error: "Esta é uma regra padrão da rede (igual para todas as escolas) e não pode ser alterada pela escola." });
    return;
  }
  const parsed = ConfiguracaoInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db.select().from(configuracoesTable)
    .where(and(eq(configuracoesTable.chave, chave), eq(configuracoesTable.escolaId, escolaId)))
    .then(r => r[0]);
  let row;
  if (existing) {
    [row] = await db.update(configuracoesTable)
      .set({ valor: parsed.data.valor, descricao: parsed.data.descricao })
      .where(and(eq(configuracoesTable.chave, chave), eq(configuracoesTable.escolaId, escolaId)))
      .returning();
  } else {
    [row] = await db.insert(configuracoesTable).values({ chave, escolaId, ...parsed.data }).returning();
  }
  res.json(row);
});

export default router;
