import { Router } from "express";
import { db } from "@workspace/db";
import { salasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

const SalaInput = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["sala_aula", "laboratorio", "quadra", "informatica", "auditorio", "biblioteca", "sala_arte", "outro"]).default("sala_aula"),
  capacidade: z.number().int().min(1).default(35),
  observacoes: z.string().optional(),
});

const SalaUpdate = SalaInput.partial().extend({ ativa: z.boolean().optional() });

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const salas = await db.select().from(salasTable).where(eq(salasTable.escolaId, escolaId)).orderBy(salasTable.nome);
  res.json(salas);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = SalaInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [sala] = await db.insert(salasTable).values({ ...parsed.data, escolaId }).returning();
  res.status(201).json(sala);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = SalaUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [sala] = await db.update(salasTable)
    .set(parsed.data)
    .where(and(eq(salasTable.id, id), eq(salasTable.escolaId, escolaId)))
    .returning();
  if (!sala) {
    res.status(404).json({ error: "Sala não encontrada" });
    return;
  }
  res.json(sala);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  await db.delete(salasTable).where(and(eq(salasTable.id, id), eq(salasTable.escolaId, escolaId)));
  res.status(204).send();
});

export default router;
