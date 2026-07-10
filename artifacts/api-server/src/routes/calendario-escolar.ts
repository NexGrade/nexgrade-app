import { Router } from "express";
import { db } from "@workspace/db";
import { calendarioEscolarTable, trimestresLetivosTable, turmasTable, turmaDisciplinasTable, disciplinasTable, horariosTable, matrizesCurricularesTable, itensMatrizTable } from "@workspace/db";
import { and, eq, asc } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

// GET /calendario-escolar?ano=2026 -- lista eventos do calendario (feriados, recessos, marcos)
router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const eventos = await db.select().from(calendarioEscolarTable)
    .where(and(eq(calendarioEscolarTable.escolaId, escolaId), eq(calendarioEscolarTable.ano, ano)))
    .orderBy(asc(calendarioEscolarTable.data));

  res.json(eventos);
});

// GET /calendario-escolar/trimestres?ano=2026 -- resumo dos trimestres letivos
router.get("/trimestres", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const trimestres = await db.select().from(trimestresLetivosTable)
    .where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano)))
    .orderBy(asc(trimestresLetivosTable.trimestre));

  res.json(trimestres);
});

// GET /calendario-escolar/carga-horaria?ano=2026 -- carga horaria cumprida (grade x semanas letivas) vs exigida (matriz/override) por turma+disciplina
router.get("/carga-horaria", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const [turmas, turmaDiscsTodos, disciplinas, horarios, trimestres, matrizes, itensMatrizTodos] = await Promise.all([
    db.select().from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.anoLetivo, ano))),
    db.select().from(turmaDisciplinasTable),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(trimestresLetivosTable).where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano))),
    db.select().from(matrizesCurricularesTable).where(eq(matrizesCurricularesTable.escolaId, escolaId)),
    db.select().from(itensMatrizTable),
  ]);

  const turmaIds = new Set(turmas.map(t => t.id));
  const turmaDiscs = turmaDiscsTodos.filter(td => turmaIds.has(td.turmaId));

  const resultado = turmaDiscs.map(td => {
    const turma = turmas.find(t => t.id === td.turmaId);
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!turma || !disc) return null;

    let cargaSemanalExigida = td.cargaHorariaSemanalOverride;
    if (cargaSemanalExigida == null && turma.matrizCurricularId) {
      const matriz = matrizes.find(m => m.id === turma.matrizCurricularId);
      if (matriz) {
        const item = itensMatrizTodos.find(im => im.matrizCurricularId === matriz.id && im.disciplinaId === disc.id);
        if (item) cargaSemanalExigida = item.cargaHorariaSemanal;
      }
    }
    if (cargaSemanalExigida == null) cargaSemanalExigida = disc.cargaSemanal;

    const aulasSemanaGrid = horarios.filter(h => h.turmaId === turma.id && h.disciplinaId === disc.id).length;

    const trimestresCalc = trimestres.map(t => {
      const semanasLetivas = t.diasLetivos / 5;
      const cumprido = Math.round(aulasSemanaGrid * semanasLetivas);
      const exigido = Math.round((cargaSemanalExigida as number) * semanasLetivas);
      return {
        trimestre: t.trimestre,
        semanasLetivas: Math.round(semanasLetivas * 10) / 10,
        cumprido,
        exigido,
        status: cumprido >= exigido ? "ok" : "insuficiente",
      };
    });

    const totalCumprido = trimestresCalc.reduce((s, t) => s + t.cumprido, 0);
    const totalExigido = trimestresCalc.reduce((s, t) => s + t.exigido, 0);

    return {
      turmaId: turma.id,
      turmaNome: turma.nome,
      disciplinaId: disc.id,
      disciplinaNome: disc.nome,
      cargaSemanalExigida,
      aulasSemanaGrid,
      trimestres: trimestresCalc,
      totalCumprido,
      totalExigido,
      status: totalCumprido >= totalExigido ? "ok" : "insuficiente",
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  res.json(resultado);
});

export default router;