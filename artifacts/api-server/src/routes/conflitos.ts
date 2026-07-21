import { Router } from "express";
import { db } from "@workspace/db";
import { horariosTable, professoresTable, disciplinasTable, turmasTable, turmaDisciplinasTable, professorDisciplinasTable, disponibilidadeTable, salasTable, configuracoesTable, trimestresLetivosTable } from "@workspace/db";
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
  const [slots, professores, disciplinas, turmas, turmaDiscsTodos, profDiscs, salas, configs] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(turmaDisciplinasTable),
    db.select().from(professorDisciplinasTable),
    db.select().from(salasTable).where(eq(salasTable.escolaId, escolaId)),
    db.select().from(configuracoesTable).where(eq(configuracoesTable.escolaId, escolaId)),
  ]);

  const turnoPorTurmaId = new Map(turmas.map((t) => [t.id, t.turno]));

  function configValor<T>(chave: string, padrao: T): T {
    const cfg = configs.find((c) => c.chave === chave);
    return (cfg?.valor as T) ?? padrao;
  }
  const tetoAulasTurno = configValor("seed_pr.teto_aulas_turno", { noturno: 19, diurno: 24 });
  const horaAtividadeMesmoTurnoAte = configValor("seed_pr.hora_atividade_mesmo_turno_ate", 19);
  const maxAulasGeminadasPadrao = configValor("seed_pr.max_aulas_geminadas_padrao", 2);
  const padrao20h = configValor("seed_pr.padrao_20h", { aulasRegencia: 15, horasAtividade: 9 });
  const padrao40h = configValor("seed_pr.padrao_40h", { aulasRegencia: 30, horasAtividade: 18 });

  const turmaIdsDaEscola = new Set(turmas.map(t => t.id));
  const turmaDiscs = turmaDiscsTodos.filter(td => turmaIdsDaEscola.has(td.turmaId));

  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  const conflitos: Conflito[] = [];

  const slotProfMap: Record<string, number[]> = {};
  slots.forEach(s => {
    const turno = turnoPorTurmaId.get(s.turmaId) ?? "desconhecido";
    const key = `${s.professorId}-${turno}-${s.diaSemana}-${s.numeroAula}`;
    if (!slotProfMap[key]) slotProfMap[key] = [];
    slotProfMap[key]!.push(s.id);
  });
  Object.entries(slotProfMap).forEach(([key, ids]) => {
    if (ids.length > 1) {
      const partes = key.split("-");
      const profId = Number(partes[0]);
      const dia = Number(partes[2]);
      const aula = Number(partes[3]);
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

  const cargaPorTurmaDisc: Record<string, number> = {};
  slots.forEach(s => {
    const key = `${s.turmaId}-${s.disciplinaId}`;
    cargaPorTurmaDisc[key] = (cargaPorTurmaDisc[key] ?? 0) + 1;
  });
  turmaDiscs.forEach(td => {
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!disc) return;
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

  const slotsProf: Record<string, Record<number, number[]>> = {};
  slots.forEach(s => {
    const turno = turnoPorTurmaId.get(s.turmaId) ?? "desconhecido";
    const chaveProfTurno = `${s.professorId}-${turno}`;
    if (!slotsProf[chaveProfTurno]) slotsProf[chaveProfTurno] = {};
    if (!slotsProf[chaveProfTurno]![s.diaSemana]) slotsProf[chaveProfTurno]![s.diaSemana] = [];
    slotsProf[chaveProfTurno]![s.diaSemana]!.push(s.numeroAula);
  });
  Object.entries(slotsProf).forEach(([chaveProfTurno, diasMap]) => {
    const profIdStr = chaveProfTurno.split("-")[0];
    Object.entries(diasMap).forEach(([dia, aulas]) => {
      const sorted = aulas.sort((a, b) => a - b);
      const janelas = (sorted[sorted.length - 1]! - sorted[0]! + 1) - sorted.length;
      if (janelas >= 2) {
        const prof = professores.find(p => p.id === Number(profIdStr));
        conflitos.push({
          tipo: "janelas_excessivas",
          descricao: `Prof. ${prof?.nome ?? profIdStr} tem ${janelas} janela(s) no ${["Seg","Ter","Qua","Qui","Sex"][Number(dia)]}`,
          gravidade: janelas >= 3 ? "medio" : "baixo",
          turmaId: null,
          professorId: Number(profIdStr),
          diaSemana: Number(dia),
          numeroAula: null,
        });
      }
    });
  });

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

  const indisponibilidadeSet = new Set(
    disponibilidades
      .filter(d => !d.disponivel)
      .map(d => `${d.professorId}-${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`),
  );
  slots.forEach(s => {
    const turno = turnoPorTurmaId.get(s.turmaId) ?? "desconhecido";
    if (indisponibilidadeSet.has(`${s.professorId}-${turno}-${s.diaSemana}-${s.numeroAula}`)) {
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

  const salaPorNome = new Map(salas.map((s) => [s.nome, s]));
  slots.forEach((s) => {
    const disc = disciplinas.find((d) => d.id === s.disciplinaId);
    if (!disc?.tipoSalaExigido) return;
    const salaUsada = s.sala ? salaPorNome.get(s.sala) : undefined;
    if (!salaUsada || salaUsada.tipo !== disc.tipoSalaExigido) {
      const turma = turmas.find((t) => t.id === s.turmaId);
      conflitos.push({
        tipo: "sala_incompativel",
        descricao: `"${disc.nome}" exige sala do tipo "${disc.tipoSalaExigido}", mas a turma ${turma?.nome ?? s.turmaId} está com "${s.sala ?? "sem sala definida"}"`,
        gravidade: "alto",
        turmaId: s.turmaId,
        professorId: s.professorId,
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
      });
    }
  });

  const slotSalaMap: Record<string, number[]> = {};
  slots.forEach((s) => {
    if (!s.sala) return;
    const sala = salaPorNome.get(s.sala);
    if (!sala || sala.tipo === "sala_aula") return;
    const key = `${s.sala}-${s.diaSemana}-${s.numeroAula}`;
    if (!slotSalaMap[key]) slotSalaMap[key] = [];
    slotSalaMap[key]!.push(s.id);
  });
  Object.entries(slotSalaMap).forEach(([key, ids]) => {
    if (ids.length > 1) {
      const [salaNome, dia, aula] = key.split("-");
      conflitos.push({
        tipo: "sala_restrita_duplicada",
        descricao: `Sala "${salaNome}" está reservada para ${ids.length} turmas ao mesmo tempo no ${["Seg", "Ter", "Qua", "Qui", "Sex"][Number(dia)]}, aula ${aula}`,
        gravidade: "critico",
        turmaId: null,
        professorId: null,
        diaSemana: Number(dia),
        numeroAula: Number(aula),
      });
    }
  });

  const consecutivasPorTurmaDiscDia: Record<string, number[]> = {};
  slots.forEach((s) => {
    const key = `${s.turmaId}-${s.disciplinaId}-${s.diaSemana}`;
    if (!consecutivasPorTurmaDiscDia[key]) consecutivasPorTurmaDiscDia[key] = [];
    consecutivasPorTurmaDiscDia[key]!.push(s.numeroAula);
  });
  Object.entries(consecutivasPorTurmaDiscDia).forEach(([key, aulas]) => {
    const [turmaId, disciplinaId, dia] = key.split("-").map(Number);
    const td = turmaDiscs.find((t) => t.turmaId === turmaId && t.disciplinaId === disciplinaId);
    const limite = td?.maxAulasConsecutivasDia ?? maxAulasGeminadasPadrao;
    const ordenado = [...aulas].sort((a, b) => a - b);
    let maiorSequencia = 1;
    let atual = 1;
    for (let i = 1; i < ordenado.length; i++) {
      atual = ordenado[i] === ordenado[i - 1]! + 1 ? atual + 1 : 1;
      maiorSequencia = Math.max(maiorSequencia, atual);
    }
    if (maiorSequencia > limite) {
      const turma = turmas.find((t) => t.id === turmaId);
      const disc = disciplinas.find((d) => d.id === disciplinaId);
      conflitos.push({
        tipo: "aulas_geminadas_excedidas",
        descricao: `Turma ${turma?.nome ?? turmaId}: "${disc?.nome ?? disciplinaId}" tem ${maiorSequencia} aulas seguidas no ${["Seg", "Ter", "Qua", "Qui", "Sex"][dia ?? 0]} (limite: ${limite})`,
        gravidade: "medio",
        turmaId,
        professorId: null,
        diaSemana: dia,
        numeroAula: null,
      });
    }
  });

  const aulasPorProfTurno: Record<string, number> = {};
  slots.forEach((s) => {
    const turma = turmas.find((t) => t.id === s.turmaId);
    if (!turma) return;
    const key = `${s.professorId}-${turma.turno}`;
    aulasPorProfTurno[key] = (aulasPorProfTurno[key] ?? 0) + 1;
  });
  Object.entries(aulasPorProfTurno).forEach(([key, total]) => {
    const [profId, turno] = key.split("-", 2) as [string, string];
    const teto = turno === "noturno" ? tetoAulasTurno.noturno : tetoAulasTurno.diurno;
    if (total > teto) {
      const prof = professores.find((p) => p.id === Number(profId));
      conflitos.push({
        tipo: "teto_aulas_turno_excedido",
        descricao: `Prof. ${prof?.nome ?? profId} tem ${total} aulas no turno ${turno} (teto SEED-PR: ${teto})`,
        gravidade: "critico",
        turmaId: null,
        professorId: Number(profId),
        diaSemana: null,
        numeroAula: null,
      });
    }
  });

  professores.forEach((prof) => {
    const exigido = prof.cargaHorariaTotal >= 40 ? padrao40h.horasAtividade : padrao20h.horasAtividade;
    const haMarcadas = disponibilidades.filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria).length;
    if (haMarcadas < exigido) {
      conflitos.push({
        tipo: "hora_atividade_insuficiente",
        descricao: `Prof. ${prof.nome} (padrão ${prof.cargaHorariaTotal}h) tem apenas ${haMarcadas}/${exigido} horas-atividade marcadas na disponibilidade`,
        gravidade: "medio",
        turmaId: null,
        professorId: prof.id,
        diaSemana: null,
        numeroAula: null,
      });
    }

    const turnosComAula: Record<string, number> = {};
    slots.filter((s) => s.professorId === prof.id).forEach((s) => {
      const turma = turmas.find((t) => t.id === s.turmaId);
      if (!turma) return;
      turnosComAula[turma.turno] = (turnosComAula[turma.turno] ?? 0) + 1;
    });
    const turnosComHA = new Set(
      disponibilidades
        .filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria && d.turno)
        .map((d) => d.turno as string),
    );
    Object.entries(turnosComAula).forEach(([turno, total]) => {
      if (total <= horaAtividadeMesmoTurnoAte && !turnosComHA.has(turno)) {
        conflitos.push({
          tipo: "hora_atividade_turno_incorreto",
          descricao: `Prof. ${prof.nome} tem ${total} aulas no turno ${turno} (<= ${horaAtividadeMesmoTurnoAte}) mas nenhuma hora-atividade obrigatória marcada nesse mesmo turno`,
          gravidade: "medio",
          turmaId: null,
          professorId: prof.id,
          diaSemana: null,
          numeroAula: null,
        });
      }
    });
  });

  const anosLetivosDasTurmas = [...new Set(turmas.map(t => t.anoLetivo))];
  if (anosLetivosDasTurmas.length > 0) {
    const trimestresCadastrados = await db.select().from(trimestresLetivosTable)
      .where(eq(trimestresLetivosTable.escolaId, escolaId));
    const anosComCalendario = new Set(trimestresCadastrados.map(t => t.ano));
    turmas.forEach(t => {
      if (!anosComCalendario.has(t.anoLetivo)) {
        conflitos.push({
          tipo: "turma_sem_calendario",
          descricao: "Turma " + t.nome + " nao tem calendario escolar (feriados/trimestres) cadastrado para o ano letivo " + t.anoLetivo + " -- necessario para validar dias letivos e carga horaria",
          gravidade: "medio",
          turmaId: t.id,
          professorId: null,
          diaSemana: null,
          numeroAula: null,
        });
      }
    });
  }
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
    case "sala_incompativel":
      return [
        "Edite este horário e selecione uma sala do tipo exigido pela disciplina",
        "Verifique se a escola tem sala suficiente desse tipo cadastrada em 'Salas'",
        "Se a disciplina não precisa mais desse vínculo, remova o 'Tipo de sala exigido' no cadastro dela",
      ];
    case "sala_restrita_duplicada":
      return [
        "Mova uma das turmas para outro horário — o espaço é de uso exclusivo por vez",
        "Verifique se existe mais de uma sala desse tipo (ex. 2 laboratórios) e cadastre a que falta",
      ];
    case "aulas_geminadas_excedidas":
      return [
        "Redistribua as aulas dessa disciplina/turma para não ultrapassar o limite no mesmo dia",
        "Se for intencional (ex. aula prática longa), ajuste o limite em 'Turmas' > disciplina > Max. aulas consecutivas/dia",
      ];
    case "teto_aulas_turno_excedido":
      return [
        "Redistribua parte da carga do professor para outro turno",
        "Confirme o padrão (20h/40h) cadastrado do professor — o teto muda conforme o padrão e o turno",
        "Considere dividir a disciplina entre dois professores habilitados",
      ];
    case "hora_atividade_insuficiente":
      return [
        "Cadastre blocos de indisponibilidade marcados como 'Hora-Atividade obrigatória' até completar o total exigido pelo padrão do professor",
        "Confirme se o padrão (20h/40h) do professor está correto no cadastro",
      ];
    case "hora_atividade_turno_incorreto":
      return [
        "Marque a hora-atividade do professor no mesmo turno em que ele dá aula, informando o campo 'Turno' na disponibilidade",
        "Revise se o professor tem aulas em mais de um turno — nesse caso a HA pode legitimamente ficar dividida",
      ];
    case "turma_sem_calendario":
      return [
        "Acesse 'Calendario Escolar' e cadastre os trimestres letivos e feriados do ano letivo desta turma",
        "Sem essa configuracao nao e possivel validar se a carga horaria cumprida atende ao minimo legal (LDB Art. 24)",
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
