import { Router } from "express";
import { db } from "@workspace/db";
import { horariosTable, professoresTable, disciplinasTable, turmasTable, turmaDisciplinasTable, professorDisciplinasTable, disponibilidadeTable, salasTable, configuracoesTable, trimestresLetivosTable, horarioSlotsTable } from "@workspace/db";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { calcularHoraAtividadePorTurno } from "../lib/hora-atividade";

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

// [FIX] Exportada pra ser reutilizada em routes/stats.ts -- antes o
// dashboard tinha sua PRÓPRIA lógica de detectar "professor duplicado",
// copiada e colada aqui, sem levar turno em conta (o mesmo bug que já
// corrigimos aqui). Duas implementações da mesma coisa sempre acabam
// dessincronizando -- agora só existe uma fonte de verdade.
export async function detectarConflitos(escolaId: string): Promise<Conflito[]> {
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
  // [FIX] padrao20h/padrao40h removidos -- não são mais usados agora que
  // a exigência de HA é calculada proporcionalmente às aulas reais de
  // cada professor, não por um regime fixo não confirmado (ver seção 11
  // mais abaixo).

  const turmaIdsDaEscola = new Set(turmas.map(t => t.id));
  const turmaDiscs = turmaDiscsTodos.filter(td => turmaIdsDaEscola.has(td.turmaId));

  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  const conflitos: Conflito[] = [];

  // ── NOVO: Verificação de domínio de período ─────────────────────────
  // [FIX CRÍTICO] Detecta slots com numero_aula fora do domínio oficial
  // da turma — o tipo exato de dado fisicamente impossível gerado pelo
  // motor heurístico no incidente documentado na Seção 4 do relatório
  // técnico (C.E. Arlinda Ferreira Creplive, turma 2B, números de aula
  // até 11 numa turma com máximo de 6 por dia).
  //
  // O CP-SAT torna essa classe de violação estruturalmente impossível
  // por construção. Esta checagem continua sendo executada como camada
  // de defesa enquanto o motor heurístico coexiste com o CP-SAT, e
  // como auditoria permanente da grade em produção.
  const combinacoesUnicas = [...new Set(turmas.map(t => `${t.turno}|${t.nivelEnsino ?? ""}`))]
    .map(k => {
      const [turno, nivel] = k.split("|");
      return { turno: turno!, nivelEnsino: nivel || null };
    });

  const periodosValidosPorTurma = new Map<number, Set<number>>();
  await Promise.all(
    combinacoesUnicas.map(async ({ turno, nivelEnsino }) => {
      const condicaoNivel = turno === "matutino" && nivelEnsino
        ? eq(horarioSlotsTable.nivelEnsino, nivelEnsino as "fundamental" | "medio_tecnico")
        : isNull(horarioSlotsTable.nivelEnsino);
      const slotsDoTurno = await db.select().from(horarioSlotsTable)
        .where(and(
          eq(horarioSlotsTable.escolaId, escolaId),
          eq(horarioSlotsTable.turno, turno as "matutino" | "vespertino" | "noturno"),
          condicaoNivel,
        ));
      const periodosValidos = new Set(slotsDoTurno.filter(s => s.numeroAula >= 1).map(s => s.numeroAula));
      turmas
        .filter(t => t.turno === turno && (t.nivelEnsino ?? null) === nivelEnsino)
        .forEach(t => periodosValidosPorTurma.set(t.id, periodosValidos));
    }),
  );

  slots.forEach(s => {
    const periodosValidos = periodosValidosPorTurma.get(s.turmaId);
    if (!periodosValidos || periodosValidos.size === 0) return;
    if (!periodosValidos.has(s.numeroAula)) {
      const turma = turmas.find(t => t.id === s.turmaId);
      const disc = disciplinas.find(d => d.id === s.disciplinaId);
      const prof = professores.find(p => p.id === s.professorId);
      const periodosStr = [...periodosValidos].sort((a, b) => a - b).join(", ");
      conflitos.push({
        tipo: "periodo_invalido",
        descricao: `Turma "${turma?.nome ?? s.turmaId}": aula de "${disc?.nome ?? s.disciplinaId}" (Prof. ${prof?.nome ?? s.professorId}) está no ${["Seg","Ter","Qua","Qui","Sex"][s.diaSemana ?? 0]}, período ${s.numeroAula}, que não existe no esquema desta turma (períodos válidos: ${periodosStr})`,
        gravidade: "critico",
        turmaId: s.turmaId,
        professorId: s.professorId,
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
      });
    }
  });
  // ────────────────────────────────────────────────────────────────────

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
  // [FIX] Hora-Atividade institucional (disponibilidade marcada com
  // horaAtividadeObrigatoria) não contava como slot ocupado -- um
  // professor com aula, HA, aula (nessa ordem) tinha "1 janela" por
  // engano, quando não tem buraco nenhum, é HA planejada.
  disponibilidades
    .filter(d => d.horaAtividadeObrigatoria && d.turno)
    .forEach(d => {
      const chaveProfTurno = `${d.professorId}-${d.turno}`;
      if (!slotsProf[chaveProfTurno]) slotsProf[chaveProfTurno] = {};
      if (!slotsProf[chaveProfTurno]![d.diaSemana]) slotsProf[chaveProfTurno]![d.diaSemana] = [];
      slotsProf[chaveProfTurno]![d.diaSemana]!.push(d.horarioSlot);
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
    // Turmas "fantasma" (ex.: PAEE) existem só pra satisfazer vínculos de
    // disciplina sem turma real — elas nunca vão ter horário gerado de
    // propósito, então não é conflito real, é o comportamento esperado.
    if (t.fantasma) return;
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
    // [FIX] Disciplinas "semTurma" (ex.: PAEE) nao entram no teto de aulas/turno
    // da SEED-PR -- Resolucao 7.863/2024 SS10/SS11 trata PAEE como categoria
    // separada, com limite proprio de 25h/turno em acumulo de funcoes.
    const disc = disciplinas.find((d) => d.id === s.disciplinaId);
    if (disc?.semTurma) return;
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

  // [FIX] Professores "placeholder" (ex.: os de Híbrida, criados sem
  // carga horária de verdade -- cargaHorariaTotal=0) estavam sendo
  // cobrados de 9h de HA institucional como se fossem professores reais
  // de 20h. Nenhum professor de verdade tem 0h contratada, então usamos
  // isso como sinal seguro pra pular a checagem de HA só pra eles.
  professores.filter((prof) => prof.cargaHorariaTotal > 0).forEach((prof) => {
    const turnosComAula: Record<string, number> = {};
    slots.filter((s) => s.professorId === prof.id).forEach((s) => {
      const turma = turmas.find((t) => t.id === s.turmaId);
      if (!turma) return;
      // [FIX] Mesma excecao do teto de aulas/turno: disciplinas "semTurma"
      // (ex.: PAEE) nao entram na contagem que gera a exigencia de HA
      // institucional -- SS11 da Resolucao 7.863/2024 trata PAEE como
      // categoria que nao recebe HA da mesma forma que professor regular.
      const disc = disciplinas.find((d) => d.id === s.disciplinaId);
      if (disc?.semTurma) return;
      turnosComAula[turma.turno] = (turnosComAula[turma.turno] ?? 0) + 1;
    });

    // [FIX] Antes usava um número FIXO (9 pra "20h", 18 pra "40h") com
    // base no regime cadastrado -- só que todo professor foi cadastrado
    // com 20h por padrão, sem confirmar o regime real de cada um (essa
    // confirmação nunca aconteceu). Isso fazia professor com poucas
    // aulas (ex.: 8 aulas) ser cobrado de 9 HA, quando pela mesma regra
    // proporcional já usada em lib/hora-atividade.ts (HA = aulas ÷ 3,
    // por turno) ele precisaria de bem menos. Agora usa essa fórmula
    // proporcional em vez do número fixo baseado num regime não
    // confirmado.
    const haInstitucionalPorTurno = calcularHoraAtividadePorTurno(turnosComAula);
    const exigido = Object.values(haInstitucionalPorTurno).reduce((a, b) => a + b, 0);

    const haMarcadas = disponibilidades.filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria).length;
    if (exigido > 0 && haMarcadas < exigido) {
      conflitos.push({
        tipo: "hora_atividade_insuficiente",
        descricao: `Prof. ${prof.nome} tem apenas ${haMarcadas}/${exigido} horas-atividade marcadas na disponibilidade (tabela oficial SEED-PR de Jornada de Trabalho)`,
        gravidade: "medio",
        turmaId: null,
        professorId: prof.id,
        diaSemana: null,
        numeroAula: null,
      });
    }

    const turnosComHA = new Set(
      disponibilidades
        .filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria && d.turno)
        .map((d) => d.turno as string),
    );
    // [FIX] Antes exigia HA especificamente NO MESMO turno de cada
    // grupo de aulas. Mas é prática normal da escola um professor com
    // a grade cheia num turno fazer a HA no turno OPOSTO, no mesmo dia
    // em que já está lá (ex.: dá aula de manhã, HA à tarde) -- "turno
    // alternado". Agora só acusa se o professor não tiver HA marcada
    // em NENHUM turno (sinal real de que a HA dele nunca foi
    // registrada, não uma diferença legítima de turno alternado).
    Object.entries(turnosComAula).forEach(([turno, total]) => {
      if (total <= horaAtividadeMesmoTurnoAte && turnosComHA.size === 0) {
        conflitos.push({
          tipo: "hora_atividade_turno_incorreto",
          descricao: `Prof. ${prof.nome} tem ${total} aulas no turno ${turno} (<= ${horaAtividadeMesmoTurnoAte}) mas nenhuma hora-atividade obrigatória marcada em turno nenhum`,
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
    case "periodo_invalido":
      return [
        "Este slot foi gravado com um número de período que não existe no esquema atual da turma — use 'Substituir tudo' ou o motor CP-SAT para regenerar a grade, ambos garantem que nenhum período inválido é gerado",
        "Se o esquema de horários foi alterado recentemente (ex.: de 5 para 6 períodos), todos os slots anteriores ao novo esquema precisam ser removidos e regenerados",
        "Você pode remover manualmente este slot específico no editor de grade e reinserir no período correto",
      ];
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

// [FIX] Express gera ETag automatico em toda resposta JSON por padrao.
// O navegador guardava o ETag dessas rotas e passava a enviar
// If-None-Match nas chamadas seguintes -- o servidor respondia 304 (Not
// Modified) mesmo depois de a grade ter sido alterada de verdade,
// fazendo a tela de Conflitos parecer "travada" com um numero antigo.
// Conflitos precisam refletir o estado atual do banco em toda consulta,
// entao cache aqui e sempre incorreto -- nunca deve ser reutilizado.
router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const escolaId = getEscolaId(req);
  const conflitos = await detectarConflitos(escolaId);
  res.json(conflitos);
});

router.get("/sugestoes", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const escolaId = getEscolaId(req);
  const conflitos = await detectarConflitos(escolaId);
  const resultado: ConflitoComSugestao[] = conflitos.map(c => ({
    conflito: c,
    sugestoes: gerarSugestoes(c),
  }));
  res.json(resultado);
});

export default router;
