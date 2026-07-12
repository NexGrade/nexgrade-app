import { Router } from "express";
import { db } from "@workspace/db";
import { aulasFixasTable, turmasTable, disciplinasTable, professoresTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// Constraint manual (RNF-GER-XX): trava uma aula específica (turma +
// disciplina + professor) num dia/slot exato, ANTES do gerador de
// horário rodar (ver routes/horarios.ts). Uso típico: professor com
// disponibilidade muito restrita, onde é mais simples fixar a aula
// manualmente do que confiar no algoritmo pra encontrar o único
// encaixe possível.
//
// `aulas_fixas` tem escolaId próprio, mas turmaId/disciplinaId/
// professorId também precisam ser validados como pertencentes à
// mesma escola — sem isso, um ID de outra escola poderia ser
// referenciado por engano (ou de propósito).
const router = Router();

const AulaFixaInput = z.object({
  turmaId: z.number().int(),
  disciplinaId: z.number().int(),
  professorId: z.number().int(),
  diaSemana: z.number().int().min(0).max(6),
  numeroAula: z.number().int().min(1),
  anoLetivo: z.number().int(),
});

async function validarEntidadesDaEscola(
  { turmaId, disciplinaId, professorId }: { turmaId: number; disciplinaId: number; professorId: number },
  escolaId: string,
) {
  const [turma, disciplina, professor] = await Promise.all([
    db.select().from(turmasTable).where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId))).then(r => r[0]),
    db.select().from(disciplinasTable).where(and(eq(disciplinasTable.id, disciplinaId), eq(disciplinasTable.escolaId, escolaId))).then(r => r[0]),
    db.select().from(professoresTable).where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId))).then(r => r[0]),
  ]);
  return { turma, disciplina, professor };
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = req.query.turmaId ? Number(req.query.turmaId) : undefined;

  const rows = turmaId
    ? await db.select().from(aulasFixasTable)
        .where(and(eq(aulasFixasTable.escolaId, escolaId), eq(aulasFixasTable.turmaId, turmaId)))
    : await db.select().from(aulasFixasTable).where(eq(aulasFixasTable.escolaId, escolaId));

  res.json(rows);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = AulaFixaInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { turma, disciplina, professor } = await validarEntidadesDaEscola(parsed.data, escolaId);
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }
  if (!disciplina) {
    res.status(404).json({ error: "Disciplina não encontrada" });
    return;
  }
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  // Uma trava por turma/dia/slot/ano — evita duas aulas fixas
  // disputando o mesmo horário da mesma turma.
  const conflito = await db.select().from(aulasFixasTable)
    .where(and(
      eq(aulasFixasTable.turmaId, parsed.data.turmaId),
      eq(aulasFixasTable.diaSemana, parsed.data.diaSemana),
      eq(aulasFixasTable.numeroAula, parsed.data.numeroAula),
      eq(aulasFixasTable.anoLetivo, parsed.data.anoLetivo),
    ))
    .then(r => r[0]);

  if (conflito) {
    res.status(409).json({ error: "Já existe uma aula fixa para esta turma neste dia/horário" });
    return;
  }

  const [criado] = await db.insert(aulasFixasTable)
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

  const registro = await db.select().from(aulasFixasTable)
    .where(and(eq(aulasFixasTable.id, id), eq(aulasFixasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!registro) {
    res.status(204).send();
    return;
  }

  await db.delete(aulasFixasTable).where(eq(aulasFixasTable.id, id));
  res.status(204).send();
});

export default router;
