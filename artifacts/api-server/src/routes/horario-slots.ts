import { Router } from "express";
import { db } from "@workspace/db";
import { horarioSlotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// Base de tempo do algoritmo de geração: mapeia numeroAula -> hora real,
// por turno. Consumida pelo gerador de horário (routes/horarios.ts) e
// pela exportação de PDF (routes/export.ts), que precisam mostrar horas
// reais em vez de apenas "1ª aula", "2ª aula".
//
// `horario_slots` tem escolaId próprio (diferente de disponibilidade,
// que escopa via professorId) — filtragem é direta.
const router = Router();

const HorarioSlotInput = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  numeroAula: z.number().int().min(1),
  horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato esperado HH:MM"),
  duracaoMinutos: z.number().int().min(1).default(50),
});

// Criação em lote: gera o esquema inteiro de um turno de uma vez (fluxo
// do wizard de Horário/Esquema — passo "esquema base" + "ajustes finos").
// Substitui todos os slots existentes daquele turno, evitando N chamadas
// separadas.
const HorarioSlotLoteInput = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  slots: z.array(
    z.object({
      numeroAula: z.number().int().min(1),
      horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato esperado HH:MM"),
      duracaoMinutos: z.number().int().min(1).default(50),
    }),
  ),
});

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turno = req.query.turno as string | undefined;

  const rows = turno
    ? await db.select().from(horarioSlotsTable)
        .where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno)))
    : await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));

  res.json(rows);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = HorarioSlotInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existente = await db.select().from(horarioSlotsTable)
    .where(and(
      eq(horarioSlotsTable.escolaId, escolaId),
      eq(horarioSlotsTable.turno, parsed.data.turno),
      eq(horarioSlotsTable.numeroAula, parsed.data.numeroAula),
    ))
    .then(r => r[0]);

  if (existente) {
    const [atualizado] = await db.update(horarioSlotsTable)
      .set({
        horaInicio: parsed.data.horaInicio,
        duracaoMinutos: parsed.data.duracaoMinutos,
      })
      .where(eq(horarioSlotsTable.id, existente.id))
      .returning();
    res.json(atualizado);
    return;
  }

  const [criado] = await db.insert(horarioSlotsTable)
    .values({ escolaId, ...parsed.data })
    .returning();
  res.status(201).json(criado);
});

router.post("/lote", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = HorarioSlotLoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Remove o esquema anterior deste turno antes de recriar — o wizard
  // sempre substitui o esquema inteiro, nunca mescla parcialmente.
  await db.delete(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, parsed.data.turno)));

  const resultado = await db.insert(horarioSlotsTable)
    .values(parsed.data.slots.map(slot => ({ escolaId, turno: parsed.data.turno, ...slot })))
    .returning();

  res.status(201).json(resultado);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const registro = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.id, id), eq(horarioSlotsTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!registro) {
    res.status(204).send();
    return;
  }

  await db.delete(horarioSlotsTable).where(eq(horarioSlotsTable.id, id));
  res.status(204).send();
});

export default router;
