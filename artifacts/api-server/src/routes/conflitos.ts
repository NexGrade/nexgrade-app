import { Router } from "express";
import { db } from "@workspace/db";
import { horariosTable, professoresTable, disciplinasTable, turmasTable, turmaDisciplinasTable, professorDisciplinasTable, disponibilidadeTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

type Conflito = {
  tipo: string;
  descricao: string;
  gravidade: "critico" | "alto" | "medio" | "baixo";
  turmaId: number | null;
  professorId: number | null;
  diaSemana: number | null;
  numeroAula: number | null;
};

type ConflitoComSugestao = {
  conflito: Conflito;
  sugestoes: string[];
};

async function detectarConflitos(escolaId: string): Promise<Conflito[]> {
  const [slots, professores, disciplinas, turmas, turmaDiscsTodos, profDiscs] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(turmaDisciplinasTable),
    db.select().from(professorDisciplinasTable),
  ]);

  // turma_disciplinas não tem coluna própria de escola — é escopada via
  // turmaId, filtrado aqui pela lista de turmas já restrita à escola atual.
  const turmaIdsDaEscola = new Set(turmas.map(t => t.id));
  const turmaDiscs = turmaDiscsTodos.filter(td => turmaIdsDaEscola.has(td.turmaId));

  // disponibilidade_professores também não tem coluna de escola — é
  // escopada via professorId, filtrado pela lista de professores da
  // escola atual.
  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  const conflitos: Conflito[] = [];

  // 1. Professor em dois lugares ao mesmo tempo
  const slotProfMap: Record<string, number[]> = {};
  slots.forEach(s => {
    const key = `${s.professorId}-${s.diaSemana}-${s.numeroAula}`;
    if (!slotProfMap[key]) slotProfMap[key] = [];
    slotProfMap[key]!.push(s.id);
  });
  Object.entries(slotProfMap).forEach(([key, ids]) => {
    if (ids.length > 1) {
      const [profId, dia, aula] = key.split("-").map(Number);
      const prof = professores.find(p => p.id === profId);
      conflitos.push({
        tipo: "professor_duplicado",
        descricao: `Prof. ${prof?.nome ?? profId} está alocado em ${ids.length} turmas no ${["Seg","Ter","Qua","Qui","Sex"][dia ?? 0]}, aula ${aula}`,
        gravidade: "critico",
        turmaId: null,
        professorId: profId ?? null,
        diaSemana: dia ?? null,
        numeroAula: aula ?? null,
      });
    }
  });

  // 2. Disciplina com carga semanal insuficiente
  const cargaPorTurmaDisc: Record<string, number> = {};
  slots.forEach(s => {
    const key = `${s.turmaId}-${s.disciplinaId}`;
    cargaPorTurmaDisc[key] = (cargaPorTurmaDisc[key] ?? 0) + 1;
  });
  turmaDiscs.forEach(td => {
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!disc) return;
    // RF-TUR-02: mesma regra de precedência do gerador de horário —
    // override da matriz aplicada, com fallback para a carga global.
    const cargaEsperada = td.cargaHorariaSemanalOverride ?? disc.cargaSemanal;
    const atual = cargaPorTurmaDisc[`${td.turmaId}-${td.disciplinaId}`] ?? 0;
    if (atual < cargaEsperada) {
      const turma = turmas.find(t => t.id === td.turmaId);
      conflitos.push({
        tipo: "carga_insuficiente",
        descricao: `Turma ${turma?.nome ?? td.turmaId}: "${disc.nome}" tem ${atual}/${cargaEsperada} aulas`,
        gravidade: atual === 0 ? "critico" : "medio",
        turmaId: td.turmaId,
        professorId: null,
        diaSemana: null,
        numeroAula: null,
      });
    }
  });

  // 3. Professor ministrando disciplina para qual não está habilitado
  slots.forEach(s => {
    const habilitado = profDiscs.some(pd => pd.professorId === s.professorId && pd.disciplinaId === s.disciplinaId);
    if (!habilitado) {
      const prof = professores.find(p => p.id === s.professorId);
      const disc = disciplinas.find(d => d.id === s.disciplinaId);
      const turma = turmas.find(t => t.id === s.turmaId);
      conflitos.push({
        tipo: "professor_nao_habilitado",
        descricao: `Prof. ${prof?.nome ?? s.professorId} não está habilitado para "${disc?.nome ?? s.disciplinaId}" (Turma ${turma?.nome ?? s.turmaId})`,
        gravidade: "alto",
        turmaId: s.turmaId,
        professorId: s.professorId,
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
      });
    }
  });

  // 4. Professor com muitas janelas (gaps) no dia
  const slotsProf: Record<number, Record<number, number[]>> = {};
  slots.forEach(s => {
    if (!slotsProf[s.professorId]) slotsProf[s.professorId] = {};
    if (!slotsProf[s.professorId]![s.diaSemana]) slotsProf[s.professorId]![s.diaSemana] = [];
    slotsProf[s.professorId]![s.diaSemana]!.push(s.numeroAula);
  });
  Object.entries(slotsProf).forEach(([profId, diasMap]) => {
    Object.entries(diasMap).forEach(([dia, aulas]) => {
      const sorted = aulas.sort((a, b) => a - b);
      const janelas = (sorted[sorted.length - 1]! - sorted[0]! + 1) - sorted.length;
      if (janelas >= 2) {
        const prof = professores.find(p => p.id === Number(profId));
        conflitos.push({
          tipo: "janelas_excessivas",
          descricao: `Prof. ${prof?.nome ?? profId} tem ${janelas} janela(s) no ${["Seg","Ter","Qua","Qui","Sex"][Number(dia)]}`,
          gravidade: janelas >= 3 ? "medio" : "baixo",
          turmaId: null,
          professorId: Number(profId),
          diaSemana: Number(dia),
          numeroAula: null,
        });
      }
    });
  });

  // 5. Turmas sem nenhum horário gerado
  const turmasComSlot = new Set(slots.map(s => s.turmaId));
  turmas.forEach(t => {
    if (!turmasComSlot.has(t.id)) {
      conflitos.push({
        tipo: "turma_sem_horario",
        descricao: `Turma "${t.nome}" não tem nenhum horário gerado`,
        gravidade: "alto",
        turmaId: t.id,
        professorId: null,
        diaSemana: null,
        numeroAula: null,
      });
    }
  });

  // 6. Professor alocado num dia/período em que sua disponibilidade está
  // marcada como indisponível (RF-ALOC-04 / RF-PROF-04).
  const indisponibilidadeSet = new Set(
    disponibilidades
      .filter(d => !d.disponivel)
      .map(d => `${d.professorId}-${d.diaSemana}-${d.horarioSlot}`),
  );
  slots.forEach(s => {
    if (indisponibilidadeSet.has(`${s.professorId}-${s.diaSemana}-${s.numeroAula}`)) {
      const prof = professores.find(p => p.id === s.professorId);
      const turma = turmas.find(t => t.id === s.turmaId);
      conflitos.push({
        tipo: "professor_indisponivel",
        descricao: `Prof. ${prof?.nome ?? s.professorId} está alocado na turma ${turma?.nome ?? s.turmaId} num horário marcado como indisponível`,
        gravidade: "critico",
        turmaId: s.turmaId,
        professorId: s.professorId,
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
      });
    }
  });

  return conflitos;
}

function gerarSugestoes(conflito: Conflito): string[] {
  switch (conflito.tipo) {
    case "professor_duplicado":
      return [
        "Remova um dos slots conflitantes manualmente ou regenere o horário com 'Substituir tudo'",
        "Verifique se o professor está vinculado a muitas disciplinas/turmas sem slots suficientes",
        "Considere adicionar um professor substituto para uma das turmas",
      ];
    case "carga_insuficiente":
      return [
        "Regenere o horário para esta turma com a opção 'Substituir tudo'",
        "Verifique se há professor habilitado para esta disciplina cadastrado",
        "Adicione slots manualmente pelo editor de grade até completar a carga",
      ];
    case "professor_nao_habilitado":
      return [
        "Edite o perfil do professor e adicione esta disciplina às habilitações",
        "Remova este slot e regenere o horário para que apenas professores habilitados sejam alocados",
        "Atribua um professor habilitado para esta disciplina neste horário",
      ];
    case "janelas_excessivas":
      return [
        "Regenere o horário com a opção 'Reduzir janelas' ativada para compactar os horários do professor",
        "Mova manualmente aulas dos horários com janela para slots adjacentes",
        "Agrupe disciplinas do professor no mesmo turno para evitar gaps",
      ];
    case "turma_sem_horario":
      return [
        "Acesse 'Grade Horária' e clique em 'Gerar Horário' para esta turma",
        "Certifique-se de que a turma tem disciplinas cadastradas antes de gerar",
        "Verifique se existem professores habilitados para cada disciplina da turma",
      ];
    case "professor_indisponivel":
      return [
        "Mova este slot para um horário em que o professor esteja disponível",
        "Revise a disponibilidade cadastrada do professor — pode estar desatualizada",
        "Regenere o horário desta turma para que o algoritmo respeite a disponibilidade atual",
      ];
    default:
      return ["Revise manualmente a grade desta turma/professor"];
  }
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const conflitos = await detectarConflitos(escolaId);
  res.json(conflitos);
});

router.get("/sugestoes", async (req, res) => {
  const escolaId = getEscolaId(req);
  const conflitos = await detectarConflitos(escolaId);
  const resultado: ConflitoComSugestao[] = conflitos.map(c => ({
    conflito: c,
    sugestoes: gerarSugestoes(c),
  }));
  res.json(resultado);
});

export default router;
