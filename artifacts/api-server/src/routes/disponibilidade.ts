import { Router } from "express";
import { db } from "@workspace/db";
import { disponibilidadeTable, professoresTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// RF-DISP-01 a RF-DISP-03, RF-PROF-04: CRUD da disponibilidade semanal do
// professor, consumida pelo algoritmo de geração de horário
// (ver routes/horarios.ts) e pela detecção de conflitos
// (ver routes/conflitos.ts, tipo "professor_indisponivel").
//
// Convenção: só é necessário criar um registro para marcar uma EXCEÇÃO
// (disponivel = false). A ausência de registro para um professor/dia/slot
// é tratada como disponível em todo o resto do sistema.
//
// `disponibilidade_professores` não tem coluna própria de escola
// (RNF-SEG-04) — é sempre escopada validando que o `professorId`
// envolvido pertence à escola do usuário autenticado.
const router = Router();

const DisponibilidadeInput = z.object({
  professorId: z.number().int(),
  diaSemana: z.number().int().min(0).max(6),
  horarioSlot: z.number().int().min(1),
  disponivel: z.boolean().default(true),
  motivo: z.string().optional(),
});

// RF-DISP-02: edição em lote — substitui todas as marcações de
// indisponibilidade de um professor por um novo conjunto, numa única
// chamada (evita N requisições para marcar, por exemplo, um dia inteiro).
const DisponibilidadeLoteInput = z.object({
  professorId: z.number().int(),
  itens: z.array(
    z.object({
      diaSemana: z.number().int().min(0).max(6),
      horarioSlot: z.number().int().min(1),
      disponivel: z.boolean().default(true),
      motivo: z.string().optional(),
    }),
  ),
});

async function buscarProfessorDaEscola(professorId: number, escolaId: string) {
  return db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorId = req.query.professorId ? Number(req.query.professorId) : undefined;

  if (professorId) {
    const professor = await buscarProfessorDaEscola(professorId, escolaId);
    if (!professor) {
      res.status(404).json({ error: "Professor não encontrado" });
      return;
    }
    const rows = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId));
    res.json(rows);
    return;
  }

  // Sem professorId: lista a disponibilidade de todos os professores
  // desta escola (nunca de outra).
  const professoresDaEscola = await db.select({ id: professoresTable.id })
    .from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const ids = professoresDaEscola.map(p => p.id);
  const rows = ids.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, ids))
    : [];
  res.json(rows);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DisponibilidadeInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const professor = await buscarProfessorDaEscola(parsed.data.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const existente = await db.select().from(disponibilidadeTable)
    .where(and(
      eq(disponibilidadeTable.professorId, parsed.data.professorId),
      eq(disponibilidadeTable.diaSemana, parsed.data.diaSemana),
      eq(disponibilidadeTable.horarioSlot, parsed.data.horarioSlot),
    ))
    .then(r => r[0]);

  if (existente) {
    const [atualizado] = await db.update(disponibilidadeTable)
      .set({ disponivel: parsed.data.disponivel, motivo: parsed.data.motivo })
      .where(eq(disponibilidadeTable.id, existente.id))
      .returning();
    res.json(atualizado);
    return;
  }

  const [criado] = await db.insert(disponibilidadeTable).values(parsed.data).returning();
  res.status(201).json(criado);
});

router.post("/lote", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DisponibilidadeLoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const professor = await buscarProfessorDaEscola(parsed.data.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const resultado = [];
  for (const item of parsed.data.itens) {
    const existente = await db.select().from(disponibilidadeTable)
      .where(and(
        eq(disponibilidadeTable.professorId, parsed.data.professorId),
        eq(disponibilidadeTable.diaSemana, item.diaSemana),
        eq(disponibilidadeTable.horarioSlot, item.horarioSlot),
      ))
      .then(r => r[0]);

    if (existente) {
      const [atualizado] = await db.update(disponibilidadeTable)
        .set({ disponivel: item.disponivel, motivo: item.motivo })
        .where(eq(disponibilidadeTable.id, existente.id))
        .returning();
      resultado.push(atualizado);
    } else {
      const [criado] = await db.insert(disponibilidadeTable)
        .values({ professorId: parsed.data.professorId, ...item })
        .returning();
      resultado.push(criado);
    }
  }

  res.status(201).json(resultado);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const registro = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.id, id)).then(r => r[0]);
  if (!registro) {
    res.status(204).send();
    return;
  }
  const professor = await buscarProfessorDaEscola(registro.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Registro não encontrado" });
    return;
  }

  await db.delete(disponibilidadeTable).where(eq(disponibilidadeTable.id, id));
  res.status(204).send();
});

export default router;
