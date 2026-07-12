import { Router } from "express";
import { db } from "@workspace/db";
import { limitesDiariosProfessorTable, professoresTable, turmasTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// Regra "complementar" do modelo de distribuição de aulas: limite de
// aulas diárias para um professor que leciona mais de uma disciplina
// na mesma turma (ver URÂNIA+, passos 26-29 — "Francisco pode dar no
// máximo 2 aulas por dia por turma").
//
// turmaId NULO = valor padrão do professor, válido em qualquer turma
// onde ele dê mais de uma disciplina. turmaId PREENCHIDO = override
// específico pra aquela turma — tem prioridade sobre o padrão do
// professor na hora do gerador consultar o limite (ver
// routes/horarios.ts quando o motor de geração for implementado).
//
// Regras de nível GERAL (compactação de carga horária, bloqueio de
// janelas) não vivem aqui — ficam em `configuracoes`, seguindo a
// convenção já usada por "seed_pr.max_aulas_geminadas_padrao".
// Regras de nível ESPECÍFICO de aulas geminadas já existem em
// turma_disciplinas.maxAulasConsecutivasDia (routes/turmas.ts).
const router = Router();

const LimiteDiarioInput = z.object({
  professorId: z.number().int(),
  turmaId: z.number().int().nullable().default(null),
  maxAulasPorDia: z.number().int().min(1),
});

async function buscarProfessorDaEscola(professorId: number, escolaId: string) {
  return db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
}

async function buscarTurmaDaEscola(turmaId: number, escolaId: string) {
  return db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
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
    const rows = await db.select().from(limitesDiariosProfessorTable)
      .where(eq(limitesDiariosProfessorTable.professorId, professorId));
    res.json(rows);
    return;
  }

  const rows = await db.select().from(limitesDiariosProfessorTable)
    .where(eq(limitesDiariosProfessorTable.escolaId, escolaId));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = LimiteDiarioInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const professor = await buscarProfessorDaEscola(parsed.data.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  if (parsed.data.turmaId !== null) {
    const turma = await buscarTurmaDaEscola(parsed.data.turmaId, escolaId);
    if (!turma) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
  }

  // Upsert por (professorId, turmaId) — turmaId nulo é tratado à parte
  // porque "= NULL" não bate igualdade em SQL, precisa de isNull().
  const condicaoTurma = parsed.data.turmaId === null
    ? isNull(limitesDiariosProfessorTable.turmaId)
    : eq(limitesDiariosProfessorTable.turmaId, parsed.data.turmaId);

  const existente = await db.select().from(limitesDiariosProfessorTable)
    .where(and(eq(limitesDiariosProfessorTable.professorId, parsed.data.professorId), condicaoTurma))
    .then(r => r[0]);

  if (existente) {
    const [atualizado] = await db.update(limitesDiariosProfessorTable)
      .set({ maxAulasPorDia: parsed.data.maxAulasPorDia })
      .where(eq(limitesDiariosProfessorTable.id, existente.id))
      .returning();
    res.json(atualizado);
    return;
  }

  const [criado] = await db.insert(limitesDiariosProfessorTable)
    .values({ escolaId, ...parsed.data })
    .returning();
  res.status(201).json(criado);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const registro = await db.select().from(limitesDiariosProfessorTable)
    .where(and(eq(limitesDiariosProfessorTable.id, id), eq(limitesDiariosProfessorTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!registro) {
    res.status(204).send();
    return;
  }

  await db.delete(limitesDiariosProfessorTable).where(eq(limitesDiariosProfessorTable.id, id));
  res.status(204).send();
});

export default router;
