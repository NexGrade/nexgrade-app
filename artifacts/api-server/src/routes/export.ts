import { Router } from "express";
import { db } from "@workspace/db";
import {
  horariosTable, professoresTable, disciplinasTable, turmasTable, disponibilidadeTable,
  horarioSlotsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { gerarPdfGrade, type PaginaGrade } from "../lib/pdf-grade";

const router = Router();

const DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape), ...rows.map(r => r.map(escape))].map(r => r.join(",")).join("\n");
}

// [NOVO] Busca o horário real de início de cada número de aula para um
// turno + nível de ensino (nivelEnsino só importa quando turno é
// "matutino" — ver schema/horarios_slots.ts). Devolve um mapa
// numeroAula -> "HH:MM" (sem segundos), pronto pra passar direto pra
// gerarPdfGrade.
async function buscarHorariosPorAula(
  escolaId: string,
  turno: string,
  nivelEnsino: string | null,
): Promise<Record<number, string>> {
  const condicaoNivel = turno === "matutino" && nivelEnsino
    ? eq(horarioSlotsTable.nivelEnsino, nivelEnsino as "fundamental" | "medio_tecnico")
    : isNull(horarioSlotsTable.nivelEnsino);
  const rows = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno), condicaoNivel));
  const mapa: Record<number, string> = {};
  rows.forEach((r) => { mapa[r.numeroAula] = r.horaInicio.slice(0, 5); });
  return mapa;
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

// ------------------------------------------------------------------
// PDF — Visão por Turma: uma página por turma, grade dia x aula com
// disciplina + professor em cada célula. Linha "Aula" mostra o horário
// real de início (07:30, 08:20...), vindo de horario_slots -- cada
// turma tem um único turno+nivelEnsino, então não há ambiguidade aqui.
// ------------------------------------------------------------------
router.get("/grade-pdf/turma", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaIdFiltro = req.query.turmaId ? Number(req.query.turmaId) : undefined;
  const [slots, professores, disciplinas, turmasTodas] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);
  const turmas = turmaIdFiltro ? turmasTodas.filter((t) => t.id === turmaIdFiltro) : turmasTodas;

  const paginas: PaginaGrade[] = await Promise.all(turmas.map(async (turma) => ({
    titulo: `Grade Horária — Turma ${turma.nome}`,
    subtitulo: `${turma.serie} · ${turma.turno}`,
    horariosPorAula: await buscarHorariosPorAula(escolaId, turma.turno, turma.nivelEnsino),
    slots: slots
      .filter((s) => s.turmaId === turma.id)
      .map((s) => ({
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
        linha1: disciplinas.find((d) => d.id === s.disciplinaId)?.nome ?? "?",
        linha2: professores.find((p) => p.id === s.professorId)?.nome,
      })),
  })));

  const pdfBytes = await gerarPdfGrade(paginas);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="grade_por_turma.pdf"');
  res.send(Buffer.from(pdfBytes));
});

// ------------------------------------------------------------------
// PDF — Visão por Professor: uma página por professor, grade dia x
// aula com turma + disciplina em cada célula. Blocos marcados como
// Hora-Atividade obrigatória (ver RNF-SEED-01) aparecem destacados,
// para a equipe conferir concentração no turno certo antes de
// homologar (Resolução SEED n.º 7.200/2025, art. 11, §4º).
//
// [NOVO] Linha "Aula" mostra horário real, igual à visão por turma.
// Um professor pode lecionar em turmas de turnos diferentes na mesma
// semana (raro, mas possível) -- nesse caso usamos o esquema do turno
// mais frequente entre as aulas dele como melhor aproximação.
// ------------------------------------------------------------------
router.get("/grade-pdf/professor", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorIdFiltro = req.query.professorId ? Number(req.query.professorId) : undefined;
  const [slots, professoresTodos, disciplinas, turmas, disponibilidades] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);
  const professores = professorIdFiltro ? professoresTodos.filter((p) => p.id === professorIdFiltro) : professoresTodos;

  const paginas: PaginaGrade[] = await Promise.all(professores.map(async (prof) => {
    const aulasDoProf: PaginaGrade["slots"] = slots
      .filter((s) => s.professorId === prof.id)
      .map((s) => ({
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
        linha1: turmas.find((t) => t.id === s.turmaId)?.nome ?? "?",
        linha2: disciplinas.find((d) => d.id === s.disciplinaId)?.nome,
      }));

    // Turno/nível mais frequente entre as aulas deste professor, usado
    // como base pra buscar os horários reais (ver comentário acima).
    const turmasDoProf = slots
      .filter((s) => s.professorId === prof.id)
      .map((s) => turmas.find((t) => t.id === s.turmaId))
      .filter((t): t is NonNullable<typeof t> => !!t);
    const contagemTurno: Record<string, number> = {};
    turmasDoProf.forEach((t) => { contagemTurno[t.turno] = (contagemTurno[t.turno] ?? 0) + 1; });
    const turnoPredominante = Object.entries(contagemTurno).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "matutino";
    const nivelPredominante = turmasDoProf.find((t) => t.turno === turnoPredominante)?.nivelEnsino ?? null;
    const horariosPorAula = await buscarHorariosPorAula(escolaId, turnoPredominante, nivelPredominante);

    // Hora-Atividade obrigatória marcada na disponibilidade deste
    // professor entra como célula destacada, mesmo sem aula.
    const haDoProf: PaginaGrade["slots"] = disponibilidades
      .filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria)
      .filter((d) => !aulasDoProf.some((a) => a.diaSemana === d.diaSemana && a.numeroAula === d.horarioSlot))
      .map((d) => ({
        diaSemana: d.diaSemana,
        numeroAula: d.horarioSlot,
        linha1: "Hora-Atividade",
        linha2: d.turno ?? undefined,
        destacado: true,
      }));

    return {
      titulo: `Grade Horária — Prof. ${prof.nome}`,
      subtitulo: `Padrão ${prof.cargaHorariaTotal}h`,
      horariosPorAula,
      slots: [...aulasDoProf, ...haDoProf],
    };
  }));

  const pdfBytes = await gerarPdfGrade(paginas);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="grade_por_professor.pdf"');
  res.send(Buffer.from(pdfBytes));
});

export default router;
