import { Router } from "express";
import { db } from "@workspace/db";
import {
  horariosTable, professoresTable, disciplinasTable, turmasTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

const DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape), ...rows.map(r => r.map(escape))].map(r => r.join(",")).join("\n");
}

router.get("/grade", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = req.query.turmaId ? Number(req.query.turmaId) : undefined;
  const formato = (req.query.formato as string) ?? "csv";

  let slots = await db.select().from(horariosTable)
    .where(eq(horariosTable.escolaId, escolaId))
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);
  if (turmaId) slots = slots.filter(s => s.turmaId === turmaId);

  const [professores, disciplinas, turmas] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);

  const rows = slots.map(s => {
    const disc = disciplinas.find(d => d.id === s.disciplinaId);
    const prof = professores.find(p => p.id === s.professorId);
    const turma = turmas.find(t => t.id === s.turmaId);
    return [
      turma?.nome ?? "",
      DIAS[s.diaSemana] ?? "",
      String(s.numeroAula),
      disc?.nome ?? "",
      prof?.nome ?? "",
      s.sala ?? "",
    ];
  });

  if (formato === "json") {
    const data = rows.map(r => ({
      turma: r[0], dia: r[1], aula: r[2], disciplina: r[3], professor: r[4], sala: r[5],
    }));
    res.json(data);
    return;
  }

  const csv = toCSV(["Turma", "Dia", "Aula", "Disciplina", "Professor", "Sala"], rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="grade_horaria.csv"');
  res.send(csv);
});

router.get("/ponto", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorId = req.query.professorId ? Number(req.query.professorId) : undefined;
  const mes = req.query.mes ? Number(req.query.mes) : new Date().getMonth() + 1;
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  let slots = await db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId));
  if (professorId) slots = slots.filter(s => s.professorId === professorId);

  const professores = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const disciplinas = await db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId));
  const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId));

  const profMap = new Map(professores.map(p => [p.id, p]));

  const groupedByProf: Record<number, typeof slots> = {};
  slots.forEach(s => {
    if (!groupedByProf[s.professorId]) groupedByProf[s.professorId] = [];
    groupedByProf[s.professorId]!.push(s);
  });

  const rows: string[][] = [];
  for (const [profId, profSlots] of Object.entries(groupedByProf)) {
    const prof = profMap.get(Number(profId));
    profSlots.forEach(s => {
      const disc = disciplinas.find(d => d.id === s.disciplinaId);
      const turma = turmas.find(t => t.id === s.turmaId);
      rows.push([
        prof?.nome ?? "",
        prof?.email ?? "",
        DIAS[s.diaSemana] ?? "",
        String(s.numeroAula),
        disc?.nome ?? "",
        turma?.nome ?? "",
        String(mes),
        String(ano),
      ]);
    });
  }

  const csv = toCSV(
    ["Professor", "E-mail", "Dia", "Aula", "Disciplina", "Turma", "Mês", "Ano"],
    rows,
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="ponto_professores.csv"');
  res.send(csv);
});

router.get("/relatorio-seed", async (req, res) => {
  const escolaId = getEscolaId(req);
  const estado = (req.query.estado as string) ?? "SP";

  const [slots, professores, disciplinas, turmas] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);

  const relatorio = {
    estado,
    anoLetivo: new Date().getFullYear(),
    geradoEm: new Date().toISOString(),
    resumo: {
      totalTurmas: turmas.length,
      totalProfessores: professores.length,
      totalDisciplinas: disciplinas.length,
      totalAulasSemanais: slots.length,
    },
    turmas: turmas.map(t => ({
      id: t.id,
      nome: t.nome,
      serie: t.serie,
      turno: t.turno,
      grade: DIAS.map((dia, diaSemana) => ({
        dia,
        aulas: slots
          .filter(s => s.turmaId === t.id && s.diaSemana === diaSemana)
          .sort((a, b) => a.numeroAula - b.numeroAula)
          .map(s => ({
            numeroAula: s.numeroAula,
            disciplina: disciplinas.find(d => d.id === s.disciplinaId)?.nome ?? "",
            professor: professores.find(p => p.id === s.professorId)?.nome ?? "",
          })),
      })),
    })),
    professores: professores.map(p => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      cargaSemanal: slots.filter(s => s.professorId === p.id).length,
    })),
  };

  res.json(relatorio);
});

export default router;
