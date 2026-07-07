import { Router } from "express";
import { db } from "@workspace/db";
import { turmasTable, turmaDisciplinasTable, horariosTable, disciplinasTable, professoresTable, professorDisciplinasTable, matrizesCurricularesTable, itensMatrizTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateTurmaBody,
  UpdateTurmaBody,
  GetTurmaParams,
  UpdateTurmaParams,
  DeleteTurmaParams,
  GetTurmaHorarioParams,
} from "@workspace/api-zod";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";

const router = Router();

async function getTurmaWithDisciplinas(id: number, escolaId: string) {
  const turma = await db
    .select()
    .from(turmasTable)
    .where(and(eq(turmasTable.id, id), eq(turmasTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!turma) return null;
  const links = await db
    .select()
    .from(turmaDisciplinasTable)
    .where(eq(turmaDisciplinasTable.turmaId, id));
  const disciplinasAll = await db.select().from(disciplinasTable);
  return {
    ...turma,
    disciplinaIds: links.map((l) => l.disciplinaId),
    // RF-TUR-02: carga efetiva = override da matriz aplicada, com
    // fallback para a carga global da disciplina quando não houver
    // matriz aplicada a este vínculo específico.
    disciplinasComCarga: links.map((l) => {
      const disc = disciplinasAll.find((d) => d.id === l.disciplinaId);
      return {
        disciplinaId: l.disciplinaId,
        nome: disc?.nome ?? "",
        cargaHorariaSemanal: l.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,
        origemMatriz: l.cargaHorariaSemanalOverride !== null,
      };
    }),
  };
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmas = await db
    .select()
    .from(turmasTable)
    .where(eq(turmasTable.escolaId, escolaId))
    .orderBy(turmasTable.nome);
  const result = await Promise.all(
    turmas.map(async (t) => {
      const links = await db
        .select()
        .from(turmaDisciplinasTable)
        .where(eq(turmaDisciplinasTable.turmaId, t.id));
      return { ...t, disciplinaIds: links.map((l) => l.disciplinaId) };
    })
  );
  res.json(result);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CreateTurmaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { disciplinaIds, ...data } = parsed.data as {
    nome: string; serie: string; turno: string; anoLetivo: number; disciplinaIds?: number[];
  };
  const [turma] = await db
    .insert(turmasTable)
    .values({ escolaId, nome: data.nome, serie: data.serie, turno: data.turno, anoLetivo: data.anoLetivo })
    .returning();
  if (disciplinaIds && disciplinaIds.length > 0) {
    await db.insert(turmaDisciplinasTable).values(
      disciplinaIds.map((did) => ({ turmaId: turma.id, disciplinaId: did }))
    );
  }
  const result = await getTurmaWithDisciplinas(turma.id, escolaId);
  await registrarAuditoria({
    req, escolaId, entidade: "turmas", entidadeId: turma.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: result,
  });
  res.status(201).json(result);
});

router.get("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GetTurmaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await getTurmaWithDisciplinas(parsed.data.id, escolaId);
  if (!result) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }
  res.json(result);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const paramsParsed = UpdateTurmaParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = UpdateTurmaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { disciplinaIds, ...data } = parsed.data as {
    nome?: string; serie?: string; turno?: string; anoLetivo?: number; disciplinaIds?: number[];
  };
  const id = paramsParsed.data.id;
  const anterior = await getTurmaWithDisciplinas(id, escolaId);
  if (!anterior) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }
  if (Object.keys(data).length > 0) {
    await db
      .update(turmasTable)
      .set(data)
      .where(and(eq(turmasTable.id, id), eq(turmasTable.escolaId, escolaId)));
  }
  if (disciplinaIds !== undefined) {
    await db.delete(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, id));
    if (disciplinaIds.length > 0) {
      await db.insert(turmaDisciplinasTable).values(
        disciplinaIds.map((did) => ({ turmaId: id, disciplinaId: did }))
      );
    }
    // Edição manual desvincula a turma da matriz aplicada anteriormente
    // (RF-TUR-02/03) — evita `matrizCurricularId` apontar para um
    // conjunto de disciplinas que não reflete mais a realidade da turma.
    await db.update(turmasTable).set({ matrizCurricularId: null }).where(eq(turmasTable.id, id));
  }
  const result = await getTurmaWithDisciplinas(id, escolaId);
  if (!result) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }
  await registrarAuditoria({
    req, escolaId, entidade: "turmas", entidadeId: id,
    acao: "alteracao", dadosAnteriores: anterior, dadosNovos: result,
  });
  res.json(result);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DeleteTurmaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const anterior = await getTurmaWithDisciplinas(parsed.data.id, escolaId);
  if (!anterior) {
    res.status(204).send();
    return;
  }
  await db
    .delete(turmasTable)
    .where(and(eq(turmasTable.id, parsed.data.id), eq(turmasTable.escolaId, escolaId)));
  await registrarAuditoria({
    req, escolaId, entidade: "turmas", entidadeId: parsed.data.id,
    acao: "exclusao", dadosAnteriores: anterior, dadosNovos: null,
  });
  res.status(204).send();
});

// RF-TUR-02: aplica uma Matriz Curricular a uma turma, substituindo por
// completo as disciplinas vinculadas (turma_disciplinas) pelas
// disciplinas + cargas horárias definidas na matriz daquela série. É
// uma substituição intencional (não um merge) — a matriz é a fonte da
// verdade curricular da série; ajustes pontuais pós-aplicação continuam
// possíveis via PATCH /turmas/:id (disciplinaIds), que zera o override.
const AplicarMatrizInput = z.object({
  matrizCurricularId: z.number().int(),
});

router.post("/:id/aplicar-matriz", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = Number(req.params.id);
  if (!Number.isInteger(turmaId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const parsed = AplicarMatrizInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }

  const matriz = await db.select().from(matrizesCurricularesTable)
    .where(and(
      eq(matrizesCurricularesTable.id, parsed.data.matrizCurricularId),
      eq(matrizesCurricularesTable.escolaId, escolaId),
    ))
    .then((r) => r[0]);
  if (!matriz) {
    res.status(404).json({ error: "Matriz curricular não encontrada" });
    return;
  }

  const itens = await db.select().from(itensMatrizTable)
    .where(eq(itensMatrizTable.matrizCurricularId, matriz.id));

  if (itens.length === 0) {
    res.status(400).json({ error: "Esta matriz curricular ainda não tem disciplinas cadastradas" });
    return;
  }

  await db.delete(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, turmaId));
  await db.insert(turmaDisciplinasTable).values(
    itens.map((item) => ({
      turmaId,
      disciplinaId: item.disciplinaId,
      cargaHorariaSemanalOverride: item.cargaHorariaSemanal,
    })),
  );

  await db.update(turmasTable)
    .set({ matrizCurricularId: matriz.id })
    .where(eq(turmasTable.id, turmaId));

  const result = await getTurmaWithDisciplinas(turmaId, escolaId);
  await registrarAuditoria({
    req, escolaId, entidade: "turmas", entidadeId: turmaId,
    acao: "alteracao", dadosAnteriores: { ...turma, matrizAnterior: turma.matrizCurricularId }, dadosNovos: result,
  });
  res.json(result);
});

router.get("/:id/horario", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GetTurmaHorarioParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const slots = await db
    .select()
    .from(horariosTable)
    .where(and(eq(horariosTable.turmaId, parsed.data.id), eq(horariosTable.escolaId, escolaId)))
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);

  const turma = await getTurmaWithDisciplinas(parsed.data.id, escolaId);
  const disciplinasAll = await db
    .select()
    .from(disciplinasTable)
    .where(eq(disciplinasTable.escolaId, escolaId));
  const professoresAll = await db
    .select()
    .from(professoresTable)
    .where(eq(professoresTable.escolaId, escolaId));

  const result = slots.map((s) => ({
    ...s,
    turma,
    disciplina: disciplinasAll.find((d) => d.id === s.disciplinaId),
    professor: professoresAll.find((p) => p.id === s.professorId),
  }));

  res.json(result);
});

export default router;
