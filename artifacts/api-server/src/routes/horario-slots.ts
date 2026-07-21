import { Router } from "express";
import { db } from "@workspace/db";
import { horarioSlotsTable } from "@workspace/db";
import { and, eq, isNull, gte } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// Base de tempo do algoritmo de geração: mapeia numeroAula -> hora real,
// por turno. Consumida pelo gerador de horário (routes/horarios.ts) e
// pela exportação de PDF (routes/export.ts), que precisam mostrar horas
// reais em vez de apenas "1ª aula", "2ª aula".
//
// [NOVO] O turno matutino tem DOIS esquemas reais diferentes,
// dependendo do nível de ensino da turma (confirmado via PDFs reais da
// SEED-PR): Fundamental (5 aulas, 07:30-11:05) e Médio/Técnico (6 aulas,
// 07:30-11:55). Vespertino e noturno são uniformes — nivelEnsino fica
// nulo nesses dois. Toda operação abaixo precisa tratar
// turno+nivelEnsino como a identidade completa de um esquema, nunca só
// o turno sozinho — senão salvar o esquema Fundamental do matutino
// apagaria o esquema Médio/Técnico do mesmo turno (e vice-versa).
//
// [NOVO] numeroAula=0 é reservado pra um slot "informativo" fora do
// esquema oficial (ex.: 18:00 no noturno -- antes do início real da
// grade, mas onde a escola às vezes marca HA). O assistente de Esquema
// (wizard) NUNCA envia numeroAula=0 -- ele só lida com 1..N -- então
// qualquer slot 0 existente é sempre criado manualmente por script,
// nunca pelo wizard. Por isso o `/lote` abaixo exclui explicitamente
// numeroAula=0 da substituição em massa: salvar o esquema pelo wizard
// nunca apaga esse slot informativo sem querer.
//
// `horario_slots` tem escolaId próprio (diferente de disponibilidade,
// que escopa via professorId) — filtragem é direta.
const router = Router();

const NivelEnsino = z.enum(["fundamental", "medio_tecnico"]).nullable().optional();

const HorarioSlotInput = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  nivelEnsino: NivelEnsino,
  numeroAula: z.number().int().min(1),
  horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato esperado HH:MM"),
  duracaoMinutos: z.number().int().min(1).default(50),
});

// Criação em lote: gera o esquema inteiro de um turno (e, no caso do
// matutino, de um nível de ensino específico) de uma vez — fluxo do
// wizard de Horário/Esquema. Substitui os slots existentes SÓ daquela
// combinação turno+nivelEnsino, nunca o turno inteiro.
const HorarioSlotLoteInput = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  nivelEnsino: NivelEnsino,
  slots: z.array(
    z.object({
      numeroAula: z.number().int().min(1),
      horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato esperado HH:MM"),
      duracaoMinutos: z.number().int().min(1).default(50),
    }),
  ),
});

// Monta a condição de nivelEnsino de forma segura — quando nulo/ausente,
// compara com IS NULL (Drizzle não interpreta eq(coluna, undefined)
// corretamente). Mesmo padrão já usado em routes/disponibilidade.ts
// para o campo turno.
function condicaoNivelEnsino(nivelEnsino: "fundamental" | "medio_tecnico" | null | undefined) {
  return nivelEnsino ? eq(horarioSlotsTable.nivelEnsino, nivelEnsino) : isNull(horarioSlotsTable.nivelEnsino);
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turno = req.query.turno as string | undefined;
  const nivelEnsino = req.query.nivelEnsino as string | undefined;

  const condicoes = [eq(horarioSlotsTable.escolaId, escolaId)];
  if (turno) condicoes.push(eq(horarioSlotsTable.turno, turno));
  if (nivelEnsino) condicoes.push(eq(horarioSlotsTable.nivelEnsino, nivelEnsino as "fundamental" | "medio_tecnico"));

  const rows = await db.select().from(horarioSlotsTable).where(and(...condicoes));
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
      condicaoNivelEnsino(parsed.data.nivelEnsino),
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

  // [CORRIGIDO] Antes apagava TODO o esquema do turno (`WHERE turno = X`),
  // o que destruiria o esquema Médio/Técnico ao salvar o Fundamental (ou
  // vice-versa), já que os dois compartilham o mesmo turno "matutino".
  // Agora a condição inclui nivelEnsino, escopando a substituição só à
  // combinação exata que está sendo salva.
  //
  // [NOVO] Também exclui numeroAula=0 da substituição -- ver comentário
  // no topo do arquivo sobre o slot informativo (ex.: 18:00 no
  // noturno). O wizard nunca envia 0, então excluir 0 do DELETE garante
  // que salvar o esquema normal nunca apaga esse slot por acidente.
  await db.delete(horarioSlotsTable)
    .where(and(
      eq(horarioSlotsTable.escolaId, escolaId),
      eq(horarioSlotsTable.turno, parsed.data.turno),
      condicaoNivelEnsino(parsed.data.nivelEnsino),
      gte(horarioSlotsTable.numeroAula, 1),
    ));

  const resultado = await db.insert(horarioSlotsTable)
    .values(parsed.data.slots.map(slot => ({
      escolaId,
      turno: parsed.data.turno,
      nivelEnsino: parsed.data.nivelEnsino ?? null,
      ...slot,
    })))
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
