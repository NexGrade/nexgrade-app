import { Router } from "express";
import { db } from "@workspace/db";
import {
  horariosTable, professoresTable, disciplinasTable, turmasTable, disponibilidadeTable,
  horarioSlotsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { gerarPdfGradeCompacta, type BlocoGrade } from "../lib/pdf-grade";

const router = Router();

const DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

// [NOVO] Rótulo curto de turno, usado quando um professor dá aula em
// mais de um turno -- ver comentário em /grade-pdf/professor sobre por
// que cada turno vira um bloco separado.
const TURNO_ROTULO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };

// [NOVO] Nome oficial da escola, usado no cabeçalho das grades PDF
// compactas. Fixo por enquanto -- não há campo de "nome da escola"
// configurável na plataforma ainda; se um dia a NexGrade atender mais
// de uma escola, isso precisa vir de escolasTable em vez de constante.
const NOME_ESCOLA = "C.E. Prof. Mário B.T. Braga";

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape), ...rows.map(r => r.map(escape))].map(r => r.join(",")).join("\n");
}

// Primeiro nome apenas (ex.: "Anderson Silva" -> "ANDERSON") -- formato
// real confirmado nos PDFs do Urânia, que nunca mostram sobrenome.
function primeiroNome(nomeCompleto: string): string {
  return (nomeCompleto.split(" ")[0] ?? nomeCompleto).toUpperCase();
}

// Sigla da disciplina com fallback pro nome truncado, para disciplinas
// que ainda não tiveram sigla definida manualmente ou gerada em lote.
function siglaOuFallback(disc: { nome: string; sigla?: string | null } | undefined): string {
  if (!disc) return "?";
  return disc.sigla?.toUpperCase() ?? disc.nome.slice(0, 8).toUpperCase();
}

// Intervalo da semana atual no formato "DD/MM A DD/MM", igual ao
// cabeçalho usado pelo Urânia ("22/06 A 26/06").
function intervaloSemanaAtual(): string {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0 = domingo
  const offsetSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() + offsetSegunda);
  const sexta = new Date(segunda);
  sexta.setDate(segunda.getDate() + 4);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(segunda)} A ${fmt(sexta)}`;
}

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
  // [NOVO] O turno noturno sempre mostra 18:00 no topo da grade, mesmo
  // sem nenhuma aula real ali -- e o padrao visual do proprio Urania.
  // numeroAula 0 nunca e usado por aula de verdade, entao essa linha
  // sempre aparece vazia.
  if (turno === "noturno") mapa[0] = "18:00";
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
  res.send('\uFEFF' + csv);
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
  res.send('\uFEFF' + csv);
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
// PDF — Visão por Turma: formato compacto multi-turma por página
// (padrão real do Urânia). Sigla da disciplina + primeiro nome do
// professor em cada célula, horário real na coluna "Hor".
// ------------------------------------------------------------------
router.get("/grade-pdf/turma", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaIdFiltro = req.query.turmaId ? Number(req.query.turmaId) : undefined;
  const turnoFiltro = req.query.turno as string | undefined;
  const [slots, professores, disciplinas, turmasTodas] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);
  let turmas = turmaIdFiltro ? turmasTodas.filter((t) => t.id === turmaIdFiltro) : turmasTodas;
  if (turnoFiltro) turmas = turmas.filter((t) => t.turno === turnoFiltro);

  const blocos: BlocoGrade[] = await Promise.all(turmas.map(async (turma) => ({
    rotulo: `Turma: ${turma.nome}`,
    horariosPorAula: await buscarHorariosPorAula(escolaId, turma.turno, turma.nivelEnsino),
    slots: (() => {
      // [FIX] Agrupa por dia+aula antes de montar a celula -- quando ha
      // co-docencia (duas linhas de horario para o mesmo turma+dia+aula,
      // um professor_id diferente cada), junta os nomes numa celula so
      // em vez de mostrar so o primeiro registro.
      const slotsDaTurma = slots.filter((s) => s.turmaId === turma.id);
      const agrupado = new Map<string, typeof slotsDaTurma>();
      slotsDaTurma.forEach((s) => {
        const chave = `${s.diaSemana}-${s.numeroAula}`;
        if (!agrupado.has(chave)) agrupado.set(chave, []);
        agrupado.get(chave)!.push(s);
      });
      return [...agrupado.values()].map((grupo) => {
        const primeiro = grupo[0]!;
        const nomesProfessores = grupo
          .map((s) => primeiroNome(professores.find((p) => p.id === s.professorId)?.nome ?? "?"))
          .join(" + ");
        return {
          diaSemana: primeiro.diaSemana,
          numeroAula: primeiro.numeroAula,
          linha1: siglaOuFallback(disciplinas.find((d) => d.id === primeiro.disciplinaId)),
          linha2: nomesProfessores,
        };
      });
    })(),
  })));

  const pdfBytes = await gerarPdfGradeCompacta(NOME_ESCOLA, "Grade Horária por Turma", intervaloSemanaAtual(), blocos);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="grade_por_turma.pdf"');
  res.send(Buffer.from(pdfBytes));
});

// ------------------------------------------------------------------
// PDF — Visão por Professor: formato compacto multi-professor por
// página. Célula combinada "TURMA/SIGLA" numa linha só; Hora-Atividade
// obrigatória aparece como "HA" destacado.
//
// [FIX] Um professor que dá aula em mais de um turno (manhã/tarde/
// noite) agora gera UM BLOCO POR TURNO, em vez de um bloco só
// misturando tudo. Motivo: `numeroAula` é reaproveitado em cada turno
// (aula 1 é 07:30 na manhã, 13:05 na tarde, 18:45 na noite) — um bloco
// único fazia `pdf-grade.ts` (`slots.find(...)`) colidir aulas de
// turnos diferentes na mesma célula dia+número, e a primeira encontrada
// "vencia" silenciosamente, sumindo com as aulas dos outros turnos.
// ------------------------------------------------------------------
router.get("/grade-pdf/professor", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorIdFiltro = req.query.professorId ? Number(req.query.professorId) : undefined;
  const turnoFiltroProf = req.query.turno as string | undefined;
  const [slots, professoresTodos, disciplinas, turmas, disponibilidades] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);
  const professores = professorIdFiltro ? professoresTodos.filter((p) => p.id === professorIdFiltro) : professoresTodos;

  const blocos: BlocoGrade[] = [];
  for (const prof of professores) {
    const slotsDoProf = slots.filter((s) => s.professorId === prof.id);
    const turnosDoProf = [...new Set(
      slotsDoProf.map((s) => turmas.find((t) => t.id === s.turmaId)?.turno).filter((t): t is string => !!t)
    )];
    const turnosParaRenderizar = turnoFiltroProf ? turnosDoProf.filter((t) => t === turnoFiltroProf) : turnosDoProf;

    for (const turno of turnosParaRenderizar) {
      const slotsDoProfNesseTurno = slotsDoProf.filter((s) => turmas.find((t) => t.id === s.turmaId)?.turno === turno);

      const aulasDoProf: BlocoGrade["slots"] = slotsDoProfNesseTurno.map((s) => ({
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
        linha1: turmas.find((t) => t.id === s.turmaId)?.nome ?? "?",
        linha2: siglaOuFallback(disciplinas.find((d) => d.id === s.disciplinaId)),
      }));

      const nivelPredominante = turmas.find((t) => t.id === slotsDoProfNesseTurno[0]?.turmaId)?.nivelEnsino ?? null;
      const horariosPorAula = await buscarHorariosPorAula(escolaId, turno, nivelPredominante);

      // "HA" literal, igual ao Urânia — sem linha2 pra não formatar como
      // célula combinada. Filtra pelo turno certo (disponibilidade já
      // guarda o turno direto, não precisa inferir pela turma).
      const haDoProf: BlocoGrade["slots"] = disponibilidades
        .filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria && d.turno === turno)
        .filter((d) => !aulasDoProf.some((a) => a.diaSemana === d.diaSemana && a.numeroAula === d.horarioSlot))
        .map((d) => ({
          diaSemana: d.diaSemana,
          numeroAula: d.horarioSlot,
          linha1: "HA",
          destacado: true,
        }));

      // Rótulo só mostra o turno quando o professor dá aula em mais de
      // um (senão fica redundante, ex. "ALINE (Manhã)" toda vez).
      const rotulo = turnosDoProf.length > 1
        ? `${primeiroNome(prof.nome)} (${TURNO_ROTULO[turno] ?? turno})`
        : primeiroNome(prof.nome);

      blocos.push({
        rotulo,
        horariosPorAula,
        slots: [...aulasDoProf, ...haDoProf],
      });
    }
  }

  const pdfBytes = await gerarPdfGradeCompacta(NOME_ESCOLA, "Grade Horária por Professor", intervaloSemanaAtual(), blocos);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="grade_por_professor.pdf"');
  res.send(Buffer.from(pdfBytes));
});

export default router;
