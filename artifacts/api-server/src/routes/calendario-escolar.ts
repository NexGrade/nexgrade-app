import { Router } from "express";
import { db } from "@workspace/db";
import { calendarioEscolarTable, trimestresLetivosTable } from "@workspace/db";
import { and, eq, asc } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

// GET /calendario-escolar?ano=2026 — lista eventos do calendário (feriados, recessos, marcos)
router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const eventos = await db.select().from(calendarioEscolarTable)
    .where(and(eq(calendarioEscolarTable.escolaId, escolaId), eq(calendarioEscolarTable.ano, ano)))
    .orderBy(asc(calendarioEscolarTable.data));

  res.json(eventos);
});

// GET /calendario-escolar/trimestres?ano=2026 — resumo dos trimestres letivos
router.get("/trimestres", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const trimestres = await db.select().from(trimestresLetivosTable)
    .where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano)))
    .orderBy(asc(trimestresLetivosTable.trimestre));

  res.json(trimestres);
});

export default router;