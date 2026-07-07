import { Router } from "express";
import { db } from "@workspace/db";
import { disciplinasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateDisciplinaBody,
  UpdateDisciplinaBody,
  GetDisciplinaParams,
  UpdateDisciplinaParams,
  DeleteDisciplinaParams,
} from "@workspace/api-zod";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";

const router = Router();

const CORES = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const disciplinas = await db
    .select()
    .from(disciplinasTable)
    .where(eq(disciplinasTable.escolaId, escolaId))
    .orderBy(disciplinasTable.nome);
  res.json(disciplinas);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CreateDisciplinaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data as { nome: string; cargaSemanal: number; cor?: string };
  const count = await db
    .select()
    .from(disciplinasTable)
    .where(eq(disciplinasTable.escolaId, escolaId))
    .then((r) => r.length);
  const cor = data.cor ?? CORES[count % CORES.length];
  const [disciplina] = await db
    .insert(disciplinasTable)
    .values({ escolaId, nome: data.nome, cargaSemanal: data.cargaSemanal, cor })
    .returning();
  await registrarAuditoria({
    req, escolaId, entidade: "disciplinas", entidadeId: disciplina.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: disciplina,
  });
  res.status(201).json(disciplina);
});

router.get("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GetDisciplinaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const disciplina = await db
    .select()
    .from(disciplinasTable)
    .where(and(eq(disciplinasTable.id, parsed.data.id), eq(disciplinasTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!disciplina) {
    res.status(404).json({ error: "Disciplina não encontrada" });
    return;
  }
  res.json(disciplina);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const paramsParsed = UpdateDisciplinaParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = UpdateDisciplinaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const anterior = await db.select().from(disciplinasTable)
    .where(and(eq(disciplinasTable.id, paramsParsed.data.id), eq(disciplinasTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!anterior) {
    res.status(404).json({ error: "Disciplina não encontrada" });
    return;
  }
  const [disciplina] = await db
    .update(disciplinasTable)
    .set(parsed.data)
    .where(and(eq(disciplinasTable.id, paramsParsed.data.id), eq(disciplinasTable.escolaId, escolaId)))
    .returning();
  await registrarAuditoria({
    req, escolaId, entidade: "disciplinas", entidadeId: paramsParsed.data.id,
    acao: "alteracao", dadosAnteriores: anterior, dadosNovos: disciplina,
  });
  res.json(disciplina);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DeleteDisciplinaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const anterior = await db.select().from(disciplinasTable)
    .where(and(eq(disciplinasTable.id, parsed.data.id), eq(disciplinasTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!anterior) {
    res.status(204).send();
    return;
  }
  await db
    .delete(disciplinasTable)
    .where(and(eq(disciplinasTable.id, parsed.data.id), eq(disciplinasTable.escolaId, escolaId)));
  await registrarAuditoria({
    req, escolaId, entidade: "disciplinas", entidadeId: parsed.data.id,
    acao: "exclusao", dadosAnteriores: anterior, dadosNovos: null,
  });
  res.status(204).send();
});

export default router;
