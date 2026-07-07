import { Router } from "express";
import { db } from "@workspace/db";
import { comunicadosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

const ComunicadoInput = z.object({
  titulo: z.string().min(2),
  mensagem: z.string().min(5),
  tipo: z.enum(["geral", "licenca", "conflito", "horario", "urgente"]).default("geral"),
  turmaId: z.number().int().optional(),
  professorId: z.number().int().optional(),
  autorNome: z.string().default("Sistema"),
});

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = req.query.turmaId ? Number(req.query.turmaId) : undefined;
  const naoLidos = req.query.naoLidos === "true";

  let rows = await db.select().from(comunicadosTable)
    .where(eq(comunicadosTable.escolaId, escolaId))
    .orderBy(comunicadosTable.createdAt);

  if (turmaId) rows = rows.filter(c => c.turmaId === turmaId);
  if (naoLidos) rows = rows.filter(c => !c.lida);

  res.json(rows.reverse());
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = ComunicadoInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [comunicado] = await db.insert(comunicadosTable).values({ ...parsed.data, escolaId }).returning();
  res.status(201).json(comunicado);
});

router.patch("/:id/lida", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  const [comunicado] = await db.update(comunicadosTable)
    .set({ lida: true })
    .where(and(eq(comunicadosTable.id, id), eq(comunicadosTable.escolaId, escolaId)))
    .returning();
  if (!comunicado) {
    res.status(404).json({ error: "Comunicado não encontrado" });
    return;
  }
  res.json(comunicado);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  await db.delete(comunicadosTable)
    .where(and(eq(comunicadosTable.id, Number(req.params.id)), eq(comunicadosTable.escolaId, escolaId)));
  res.status(204).send();
});

export default router;
