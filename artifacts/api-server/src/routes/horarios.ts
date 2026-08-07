import { Router } from "express";
import { db } from "@workspace/db";
import {
  horariosTable,
  horariosExperimentaisTable,
  disciplinasTable,
  professoresTable,
  turmaDisciplinasTable,
  professorDisciplinasTable,
  turmasTable,
  disponibilidadeTable,
  limitesDiariosProfessorTable,
  configuracoesTable,
  horarioSlotsTable,
} from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  CreateHorarioBody,
  DeleteHorarioParams,
  ListHorariosQueryParams,
  GerarHorarioBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

async function enrichSlot(slot: typeof horariosTable.$inferSelect) {
  const [disciplina, professor, turma] = await Promise.all([
    db.select().from(disciplinasTable).where(eq(disciplinasTable.id, slot.disciplinaId)).then(r => r[0]),
    db.select().from(professoresTable).where(eq(professoresTable.id, slot.professorId)).then(r => r[0]),
    db.select().from(turmasTable).where(eq(turmasTable.id, slot.turmaId)).then(r => r[0]),
  ]);
  return { ...slot, disciplina, professor, turma };
}

// ── ALGORITHM ────────────────────────────────────────────────────────

export interface GerarOpts {
  escolaId: string;
  turmaId: number;
  aulaspordia?: number;
  substituir: boolean;
  reduzirJanelas: boolean;
  fatorPedagogico: boolean;
  compactarCargaHoraria?: boolean;
  experimental: boolean;
  nomeExperimental?: string;
  // [NOVO] Quando definido, a regeneracao fica restrita as disciplinas
  // deste professor (titular OU apoio) nesta turma -- as demais
  // disciplinas/professores da turma ficam intocados. Usado por
  // POST /gerar-professor pra evitar que regenerar as turmas de UM
  // professor apague/realoque as aulas de TODOS os outros professores
  // que dividem essas mesmas turmas.
  apenasProfessorId?: number;
  // [FIX] Permite ao chamador forcar uma ordem de dias especifica (usado
  // por gerarAlgoritmoMelhorTentativa pra tentar varias ordens e ficar
  // com a que tiver menos conflitos). Quando ausente, usa o padrao
  // (fatorPedagogico ou Segunda->Sexta).
  diasBaseOverride?: number[];
}

const CHAVE_MAX_GEMINADAS_PADRAO = "seed_pr.max_aulas_geminadas_padrao";
const DEFAULT_MAX_GEMINADAS = 2;
const CHAVE_MAX_COMPLEMENTAR_PADRAO = "seed_pr.max_aulas_complementar_padrao";

export async function gerarAlgoritmo(opts: GerarOpts) {
  const {
    escolaId, turmaId, substituir, reduzirJanelas,
    fatorPedagogico, compactarCargaHoraria = false, experimental, nomeExperimental,
  } = opts;
  const useExperimental = experimental && nomeExperimental;

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) throw new Error("Turma não encontrada");

  if (turma.turno === "matutino" && !turma.nivelEnsino) {
    throw new Error(
      "Esta turma não tem o nível de ensino definido (Fundamental ou Médio/Técnico), necessário para saber se o " +
      "esquema matutino tem 5 ou 6 aulas por dia. Defina o nível de ensino da turma antes de gerar o horário.",
    );
  }
  const condicaoNivel = turma.turno === "matutino"
    ? eq(horarioSlotsTable.nivelEnsino, turma.nivelEnsino!)
    : isNull(horarioSlotsTable.nivelEnsino);
  // [FIX] Adicionado filtro escolaId: sem ele, escolas diferentes que configuraram
  // turnos com número de períodos distinto compartilhavam o mesmo conjunto de slots,
  // fazendo AULAS ter mais linhas do que o turno desta escola realmente define.
  const slotsDoTurno = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turma.turno), condicaoNivel));
  if (slotsDoTurno.length === 0) {
    throw new Error(
      `Nenhum esquema de horário configurado para o turno "${turma.turno}"` +
      (turma.turno === "matutino" ? ` (nível: ${turma.nivelEnsino})` : "") +
      ". Configure o esquema de horários antes de gerar.",
    );
  }
  // [FIX] Domínio EXPLÍCITO: conjunto exato de numeroAula do banco, não um
  // intervalo implícito 1..N derivado do length. Se os slots tiverem lacunas
  // (ex.: 1,2,3,5 sem o 4), o Set reflete isso. Guarda para validação cruzada.
  const AULAS_VALIDAS_TURMA = new Set(slotsDoTurno.map(s => s.numeroAula).filter(n => n >= 1));

  const [turmaDiscs, disciplinas, professores, profDiscs, configGeminadas, configComplementarPadrao, limitesProfessor] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, turmaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable)
      .where(and(eq(professoresTable.escolaId, escolaId)))
      .then(rows => rows.filter(p => p.ativo)),
    db.select().from(professorDisciplinasTable),
    db.select().from(configuracoesTable)
      .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_GEMINADAS_PADRAO)))
      .then(r => r[0]),
    db.select().from(configuracoesTable)
      .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_COMPLEMENTAR_PADRAO)))
      .then(r => r[0]),
    db.select().from(limitesDiariosProfessorTable).where(eq(limitesDiariosProfessorTable.escolaId, escolaId)),
  ]);

  if (turmaDiscs.length === 0) throw new Error("A turma não tem disciplinas cadastradas");

  // [NOVO] Ver comentario em GerarOpts.apenasProfessorId.
  const turmaDiscsAlvo = opts.apenasProfessorId
    ? turmaDiscs.filter((td) => td.professorId === opts.apenasProfessorId || td.professorApoioId === opts.apenasProfessorId)
    : turmaDiscs;
  if (opts.apenasProfessorId && turmaDiscsAlvo.length === 0) {
    throw new Error("Este professor não tem nenhuma disciplina vinculada nesta turma.");
  }
  const discIdsAlvo = new Set(turmaDiscsAlvo.map((td) => td.disciplinaId));

  const maxGeminadasPadrao = typeof configGeminadas?.valor === "number"
    ? configGeminadas.valor
    : DEFAULT_MAX_GEMINADAS;

  const maxComplementarPadrao = typeof configComplementarPadrao?.valor === "number"
    ? configComplementarPadrao.valor
    : undefined;

  function limiteDiarioProfessor(professorId: number): number {
    const especifico = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === turmaId);
    if (especifico) return especifico.maxAulasPorDia;
    const padrao = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === null);
    if (padrao) return padrao.maxAulasPorDia;
    if (maxComplementarPadrao !== undefined) return maxComplementarPadrao;
    return Infinity;
  }

  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  const indisponivelProf: Record<string, boolean> = {};
  disponibilidades
    .filter(d => !d.disponivel)
    .forEach(d => {
      const chaveTurnoDisp = d.turno ?? "null";
      indisponivelProf[`${d.professorId}-${chaveTurnoDisp}-${d.diaSemana}-${d.horarioSlot}`] = true;
    });
  // [FIX] Helper que checa indisponibilidade respeitando o turno DESTA
  // turma -- olha primeiro o bloqueio especifico do turno, e tambem o
  // bloqueio "universal" (turno null, registros antigos).
  function indisponivelComTurno(professorId: number, dia: number, aula: number): boolean {
    return !!(
      indisponivelProf[`${professorId}-${turma.turno}-${dia}-${aula}`]
      || indisponivelProf[`${professorId}-null-${dia}-${aula}`]
    );
  }

  const conflitos: string[] = [];
  const slotsParaGravar: Array<{
    disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number;
  }> = [];

  const ocupadoProf: Record<string, boolean> = {};
  const ocupadoSlot: Record<string, boolean> = {};

  const existing = useExperimental
    ? await db.select().from(horariosExperimentaisTable)
        .where(and(
          eq(horariosExperimentaisTable.turmaId, turmaId),
          eq(horariosExperimentaisTable.nome, nomeExperimental!),
          eq(horariosExperimentaisTable.escolaId, escolaId),
        ))
    : await db.select().from(horariosTable)
        .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));

  const allSlots = useExperimental
    ? await db.select().from(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId))
    : await db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId));

  const existingEscopado = opts.apenasProfessorId
    ? existing.filter((s) => discIdsAlvo.has(s.disciplinaId))
    : existing;
  const existingIds = new Set(existingEscopado.map(s => s.id));
  const baseSlots = substituir ? allSlots.filter(s => !existingIds.has(s.id)) : allSlots;

  if (!substituir) {
    existing.forEach(s => {
      ocupadoSlot[`${s.diaSemana}-${s.numeroAula}`] = true;
      ocupadoProf[`${s.professorId}-${s.diaSemana}-${s.numeroAula}`] = true;
    });
  }
  baseSlots
    .filter(s => s.turmaId !== turmaId)
    .forEach(s => {
      ocupadoProf[`${s.professorId}-${s.diaSemana}-${s.numeroAula}`] = true;
    });

  const aulasPorProfessorDia: Record<number, number[]> = {};
  baseSlots.forEach(s => {
    if (!aulasPorProfessorDia[s.professorId]) aulasPorProfessorDia[s.professorId] = [];
    aulasPorProfessorDia[s.professorId].push(s.diaSemana * 100 + s.numeroAula);
  });

  const aulasProfessorNaTurmaPorDia: Record<string, number> = {};
  const slotsProfessorNaTurmaPorDia: Record<string, Set<number>> = {};
  if (!substituir) {
    existing.forEach(s => {
      const key = `${s.professorId}-${s.diaSemana}`;
      aulasProfessorNaTurmaPorDia[key] = (aulasProfessorNaTurmaPorDia[key] ?? 0) + 1;
      if (!slotsProfessorNaTurmaPorDia[key]) slotsProfessorNaTurmaPorDia[key] = new Set();
      slotsProfessorNaTurmaPorDia[key].add(s.numeroAula);
    });
  }

  const diasUsadosPorProfessor: Record<number, Set<number>> = {};
  baseSlots.forEach(s => {
    if (!diasUsadosPorProfessor[s.professorId]) diasUsadosPorProfessor[s.professorId] = new Set();
    diasUsadosPorProfessor[s.professorId].add(s.diaSemana);
  });

  const DIAS = [0, 1, 2, 3, 4];
  const diasBase = opts.diasBaseOverride ?? (fatorPedagogico ? [1, 3, 2, 4, 0] : DIAS);
  // [FIX] AULAS derivado do Set explícito (não de um range 1..N baseado no
  // length da query). Domínio fechado: qualquer código que tente usar um
  // período fora deste array estará operando num slot que não existe na
  // configuração real da escola -- a função alocar() vai lançar erro.
  const AULAS = [...AULAS_VALIDAS_TURMA].sort((a, b) => a - b);

  function cargaEfetiva(td: typeof turmaDiscs[number], disc: typeof disciplinas[number] | undefined): number {
    return td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0;
  }

  function maxGeminadasEfetivo(td: typeof turmaDiscs[number]): number {
    return td.maxAulasConsecutivasDia ?? maxGeminadasPadrao;
  }

  const discOrdenadas = [...turmaDiscsAlvo].sort((a, b) => {
    const da = disciplinas.find(d => d.id === a.disciplinaId);
    const db2 = disciplinas.find(d => d.id === b.disciplinaId);
    return cargaEfetiva(b, db2) - cargaEfetiva(a, da);
  });

  function alocar(disciplinaId: number, professorId: number, dia: number, aula: number) {
    // [FIX] Guard interno: impede silenciosamente que qualquer caminho do
    // algoritmo grave um período que não existe no esquema desta turma.
    // Transforma falha silenciosa em erro explícito e rastreável.
    if (!AULAS_VALIDAS_TURMA.has(aula)) {
      throw new Error(
        `[BUG] Tentativa de alocar período ${aula} que não existe no esquema da turma ` +
        `(períodos válidos: ${[...AULAS_VALIDAS_TURMA].sort((a,b)=>a-b).join(", ")}). ` +
        `Disciplina ${disciplinaId}, professor ${professorId}, dia ${dia}.`,
      );
    }
    slotsParaGravar.push({ disciplinaId, professorId, diaSemana: dia, numeroAula: aula });
    ocupadoSlot[`${dia}-${aula}`] = true;
    ocupadoProf[`${professorId}-${dia}-${aula}`] = true;

    if (!aulasPorProfessorDia[professorId]) aulasPorProfessorDia[professorId] = [];
    aulasPorProfessorDia[professorId].push(dia * 100 + aula);

    const keyTurmaDia = `${professorId}-${dia}`;
    aulasProfessorNaTurmaPorDia[keyTurmaDia] = (aulasProfessorNaTurmaPorDia[keyTurmaDia] ?? 0) + 1;
    if (!slotsProfessorNaTurmaPorDia[keyTurmaDia]) slotsProfessorNaTurmaPorDia[keyTurmaDia] = new Set();
    slotsProfessorNaTurmaPorDia[keyTurmaDia].add(aula);

    if (!diasUsadosPorProfessor[professorId]) diasUsadosPorProfessor[professorId] = new Set();
    diasUsadosPorProfessor[professorId].add(dia);
  }

  function semAulaAdjacenteMesmaTurma(professorId: number, dia: number, aula: number): boolean {
    const slots = slotsProfessorNaTurmaPorDia[`${professorId}-${dia}`];
    if (!slots) return true;
    return !slots.has(aula - 1) && !slots.has(aula + 1);
  }

  function respeitaLimiteComplementar(professorId: number, dia: number): boolean {
    const limite = limiteDiarioProfessor(professorId);
    if (limite === Infinity) return true;
    const atual = aulasProfessorNaTurmaPorDia[`${professorId}-${dia}`] ?? 0;
    return atual < limite;
  }

  const faltantes: Array<{
    disciplinaId: number;
    profsParaDisc: typeof professores;
    profApoio: typeof professores[number] | undefined;
    faltam: number;
    maxGeminadas: number;
  }> = [];

  for (const td of discOrdenadas) {
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!disc) continue;

    let alocadas = 0;
    const cargaSemanal = cargaEfetiva(td, disc);
    const maxGeminadas = maxGeminadasEfetivo(td);

    const profsParaDisc = td.professorId
      ? professores.filter(p => p.id === td.professorId)
      : profDiscs
          .filter(pd => pd.disciplinaId === td.disciplinaId)
          .map(pd => professores.find(p => p.id === pd.professorId))
          .filter(Boolean) as typeof professores;

    if (profsParaDisc.length === 0) {
      conflitos.push(`Sem professor habilitado para "${disc.nome}"`);
      continue;
    }

    // [NOVO] Segundo professor (co-docencia confirmada pela escola --
    // ver comentario em schema/turmas.ts sobre professorApoioId). Quando
    // definido, toda vez que o titular for alocado num slot, o apoio
    // TAMBEM precisa estar livre naquele mesmo slot -- e os dois ganham
    // uma linha propria em horarios (ver alocar() abaixo), pra que a
    // carga horaria de ambos seja contabilizada corretamente.
    const profApoio = td.professorApoioId ? professores.find((p) => p.id === td.professorApoioId) : undefined;

    const alocacaoPorDia: Record<number, number> = {};

    let diasOrdenados = diasBase;
    if (compactarCargaHoraria) {
      diasOrdenados = [...diasBase].sort((a, b) => {
        const usaA = profsParaDisc.some(p => diasUsadosPorProfessor[p.id]?.has(a)) ? 0 : 1;
        const usaB = profsParaDisc.some(p => diasUsadosPorProfessor[p.id]?.has(b)) ? 0 : 1;
        return usaA - usaB;
      });
    }

    for (const dia of diasOrdenados) {
      if (alocadas >= cargaSemanal) break;
      const jaNesteDia = alocacaoPorDia[dia] ?? 0;
      if (jaNesteDia >= maxGeminadas) continue;

      let aulasOrdem = [...AULAS];

      if (reduzirJanelas) {
        // [FIX] Era AULAS.sort() — mutava o array global. Agora [...AULAS].sort()
        // cria cópia temporária; AULAS permanece imutável para todas as disciplinas.
        aulasOrdem = [...AULAS].sort((a, b) => {
          const adjA = profsParaDisc.some(p => {
            const aulas = aulasPorProfessorDia[p.id] ?? [];
            return aulas.includes(dia * 100 + (a - 1)) || aulas.includes(dia * 100 + (a + 1));
          }) ? 0 : 1;
          const adjB = profsParaDisc.some(p => {
            const aulas = aulasPorProfessorDia[p.id] ?? [];
            return aulas.includes(dia * 100 + (b - 1)) || aulas.includes(dia * 100 + (b + 1));
          }) ? 0 : 1;
          return adjA - adjB;
        });
      }

      for (const aula of aulasOrdem) {
        if (alocadas >= cargaSemanal) break;
        const slotKey = `${dia}-${aula}`;
        if (ocupadoSlot[slotKey]) continue;

        const profDisponivel = profsParaDisc.find(
          p => !ocupadoProf[`${p.id}-${dia}-${aula}`]
            && !indisponivelComTurno(p.id, dia, aula)
            && respeitaLimiteComplementar(p.id, dia)
            && semAulaAdjacenteMesmaTurma(p.id, dia, aula)
            && (!profApoio || (
              !ocupadoProf[`${profApoio.id}-${dia}-${aula}`]
              && !indisponivelComTurno(profApoio.id, dia, aula)
              && respeitaLimiteComplementar(profApoio.id, dia)
              && semAulaAdjacenteMesmaTurma(profApoio.id, dia, aula)
            )),
        );
        if (!profDisponivel) continue;

        alocar(td.disciplinaId, profDisponivel.id, dia, aula);
        if (profApoio) alocar(td.disciplinaId, profApoio.id, dia, aula);
        alocadas++;
        alocacaoPorDia[dia] = jaNesteDia + 1;
        break;
      }
    }

    if (alocadas < cargaSemanal) {
      for (const dia of DIAS) {
        if (alocadas >= cargaSemanal) break;
        for (const aula of AULAS) {
          if (alocadas >= cargaSemanal) break;
          const slotKey = `${dia}-${aula}`;
          if (ocupadoSlot[slotKey]) continue;
          const profDisponivel = profsParaDisc.find(
            p => !ocupadoProf[`${p.id}-${dia}-${aula}`]
              && !indisponivelComTurno(p.id, dia, aula)
              && respeitaLimiteComplementar(p.id, dia)
              && semAulaAdjacenteMesmaTurma(p.id, dia, aula)
            && (!profApoio || (
              !ocupadoProf[`${profApoio.id}-${dia}-${aula}`]
              && !indisponivelComTurno(profApoio.id, dia, aula)
              && respeitaLimiteComplementar(profApoio.id, dia)
              && semAulaAdjacenteMesmaTurma(profApoio.id, dia, aula)
            )),
          );
          if (!profDisponivel) continue;

          alocar(td.disciplinaId, profDisponivel.id, dia, aula);
        if (profApoio) alocar(td.disciplinaId, profApoio.id, dia, aula);
          alocadas++;
        }
      }
    }

    if (alocadas < cargaSemanal) {
      conflitos.push(`Apenas ${alocadas}/${cargaSemanal} aulas alocadas para "${disc.nome}"`);
      if (!profApoio) {
        faltantes.push({ disciplinaId: td.disciplinaId, profsParaDisc, profApoio, faltam: cargaSemanal - alocadas, maxGeminadas });
      }
    }
  }

  // [NOVO] Passo de reparo: quando uma disciplina nao fecha a carga,
  // tenta trocar de lugar com uma aula ja alocada de OUTRA disciplina --
  // move essa outra aula pra um horario vago que sirva pra ela, e libera
  // o lugar pra disciplina que faltava. So troca quando os DOIS lados
  // ficam validos -- nunca degrada uma disciplina que ja estava completa.
  function desalocar(disciplinaId: number, professorId: number, dia: number, aula: number) {
    const idx = slotsParaGravar.findIndex(
      s => s.disciplinaId === disciplinaId && s.professorId === professorId && s.diaSemana === dia && s.numeroAula === aula,
    );
    if (idx === -1) return;
    slotsParaGravar.splice(idx, 1);
    delete ocupadoSlot[`${dia}-${aula}`];
    delete ocupadoProf[`${professorId}-${dia}-${aula}`];
    const keyTurmaDia = `${professorId}-${dia}`;
    if (aulasProfessorNaTurmaPorDia[keyTurmaDia]) aulasProfessorNaTurmaPorDia[keyTurmaDia]--;
    slotsProfessorNaTurmaPorDia[keyTurmaDia]?.delete(aula);
  }

  let houveTroca = true;
  let rodadasReparo = 0;
  const LIMITE_RODADAS_REPARO = 5;
  while (houveTroca && rodadasReparo < LIMITE_RODADAS_REPARO) {
    houveTroca = false;
    rodadasReparo++;
    for (const falt of faltantes) {
      if (falt.faltam <= 0) continue;
      const ocupadosSnapshot = [...slotsParaGravar];
      for (const ocupante of ocupadosSnapshot) {
        if (falt.faltam <= 0) break;
        if (ocupante.disciplinaId === falt.disciplinaId) continue;
        const dia = ocupante.diaSemana, aula = ocupante.numeroAula;

        const profFalt = falt.profsParaDisc.find(p => (
          (!ocupadoProf[`${p.id}-${dia}-${aula}`] || p.id === ocupante.professorId)
          && !indisponivelComTurno(p.id, dia, aula)
          && respeitaLimiteComplementar(p.id, dia)
          && semAulaAdjacenteMesmaTurma(p.id, dia, aula)
        ));
        if (!profFalt) continue;

        let novoSlot: { dia: number; aula: number } | null = null;
        for (const dia2 of DIAS) {
          if (novoSlot) break;
          for (const aula2 of AULAS) {
            if (dia2 === dia && aula2 === aula) continue;
            if (ocupadoSlot[`${dia2}-${aula2}`]) continue;
            if (ocupadoProf[`${ocupante.professorId}-${dia2}-${aula2}`]) continue;
            if (indisponivelComTurno(ocupante.professorId, dia2, aula2)) continue;
            if (!respeitaLimiteComplementar(ocupante.professorId, dia2)) continue;
            novoSlot = { dia: dia2, aula: aula2 };
            break;
          }
        }
        if (!novoSlot) continue;

        desalocar(ocupante.disciplinaId, ocupante.professorId, dia, aula);
        alocar(falt.disciplinaId, profFalt.id, dia, aula);
        alocar(ocupante.disciplinaId, ocupante.professorId, novoSlot.dia, novoSlot.aula);
        falt.faltam--;
        houveTroca = true;
      }
    }
  }

  const gravados = await db.transaction(async (tx) => {
    if (useExperimental) {
      if (substituir) {
        const condicaoDeleteExp = opts.apenasProfessorId
          ? and(
              eq(horariosExperimentaisTable.turmaId, turmaId),
              eq(horariosExperimentaisTable.nome, nomeExperimental!),
              eq(horariosExperimentaisTable.escolaId, escolaId),
              inArray(horariosExperimentaisTable.disciplinaId, [...discIdsAlvo]),
            )
          : and(
              eq(horariosExperimentaisTable.turmaId, turmaId),
              eq(horariosExperimentaisTable.nome, nomeExperimental!),
              eq(horariosExperimentaisTable.escolaId, escolaId),
            );
        await tx.delete(horariosExperimentaisTable).where(condicaoDeleteExp);
      }
      if (slotsParaGravar.length === 0) return [];
      const linhas = slotsParaGravar.map(s => ({ escolaId, nome: nomeExperimental!, turmaId, ...s }));
      return tx.insert(horariosExperimentaisTable).values(linhas).returning();
    }

    if (substituir) {
      const condicaoDelete = opts.apenasProfessorId
        ? and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId), inArray(horariosTable.disciplinaId, [...discIdsAlvo]))
        : and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId));
      await tx.delete(horariosTable).where(condicaoDelete);
    }
    if (slotsParaGravar.length === 0) return [];
    const linhas = slotsParaGravar.map(s => ({ escolaId, turmaId, ...s }));
    return tx.insert(horariosTable).values(linhas).returning();
  });

  if (useExperimental) {
    return { slotsGerados: gravados.length, conflitos, horario: [] };
  }

  const enriched = await Promise.all((gravados as typeof horariosTable.$inferSelect[]).map(enrichSlot));
  return { slotsGerados: gravados.length, conflitos, horario: enriched };
}

// ── VALIDAÇÃO DE DOMÍNIO DE PERÍODO ──────────────────────────────────
//
// [FIX] Funções de validação de domínio: garantem que qualquer período
// gravado manualmente nas rotas de escrita pertence ao conjunto real de
// slots configurados para o turno+nivelEnsino da turma — mesma garantia
// estrutural que o CP-SAT fornece por construção no motor automático.
//
// Causa raiz documentada: turma "2B" (matutino Médio, 6 aulas/dia) recebeu
// slots com numero_aula até 11 porque o heurístico usava o length da query
// de horario_slots sem filtrar por escolaId+nivelEnsino. Esta função impede
// a mesma classe de falha nas inserções manuais e na promoção de experimentos.

async function periodosValidosDaTurma(
  turmaId: number,
  escolaId: string,
): Promise<Set<number>> {
  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) return new Set();

  const condicaoNivel = turma.turno === "matutino" && turma.nivelEnsino
    ? eq(horarioSlotsTable.nivelEnsino, turma.nivelEnsino as "fundamental" | "medio_tecnico")
    : isNull(horarioSlotsTable.nivelEnsino);

  const slots = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turma.turno), condicaoNivel));

  return new Set(slots.map(s => s.numeroAula).filter(n => n >= 1));
}

async function assertPeriodoValido(
  turmaId: number,
  numeroAula: number,
  escolaId: string,
): Promise<{ ok: true } | { ok: false; erro: string; periodosValidos: number[] }> {
  const validos = await periodosValidosDaTurma(turmaId, escolaId);
  if (validos.size === 0) {
    return { ok: false, erro: "Turma sem esquema de horários configurado. Configure o esquema antes de inserir slots.", periodosValidos: [] };
  }
  if (!validos.has(numeroAula)) {
    const lista = [...validos].sort((a, b) => a - b);
    return {
      ok: false,
      erro: `Período ${numeroAula} não existe no esquema desta turma. Períodos válidos: ${lista.join(", ")}.`,
      periodosValidos: lista,
    };
  }
  return { ok: true };
}

// ── ROUTES ───────────────────────────────────────────────────────────

// [FIX] O motor heuristico e guloso e sem backtracking: uma vez que
// ocupa um horario, nunca desfaz -- entao a ORDEM em que os dias sao
// percorridos decide quem sobra sem aula (normalmente sexta-feira, ja
// que a ordem padrao e sempre Segunda->Sexta). Esta funcao roda o
// algoritmo varias vezes com ordens de dia diferentes (incluindo
// embaralhadas) e fica so com a tentativa que tiver menos conflitos --
// da pro heuristico uma segunda chance sem reescrever a logica de
// alocacao em si, que ja foi validada.
function embaralharDias(array: number[]): number[] {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export async function gerarAlgoritmoMelhorTentativa(opts: GerarOpts, tentativas = 6) {
  const ordensBase: number[][] = [
    [0, 1, 2, 3, 4], // padrao: Segunda -> Sexta
    [1, 3, 2, 4, 0], // fator pedagogico
  ];
  while (ordensBase.length < tentativas) {
    ordensBase.push(embaralharDias([0, 1, 2, 3, 4]));
  }

  let melhor: Awaited<ReturnType<typeof gerarAlgoritmo>> | null = null;
  let melhorOrdem: number[] | null = null;

  for (const ordem of ordensBase) {
    const resultado = await gerarAlgoritmo({ ...opts, diasBaseOverride: ordem });
    if (
      !melhor ||
      resultado.conflitos.length < melhor.conflitos.length ||
      (resultado.conflitos.length === melhor.conflitos.length && resultado.slotsGerados > melhor.slotsGerados)
    ) {
      melhor = resultado;
      melhorOrdem = ordem;
    }
  }

  // Garante que o banco fique exatamente no estado da MELHOR tentativa,
  // nao da ultima que rodou (cada chamada acima ja grava no banco --
  // essa chamada extra so roda quando a melhor tentativa NAO foi a
  // ultima do loop, pra corrigir o estado final).
  if (melhorOrdem && melhorOrdem !== ordensBase[ordensBase.length - 1]) {
    melhor = await gerarAlgoritmo({ ...opts, diasBaseOverride: melhorOrdem });
  }

  return melhor!;
}

router.post("/gerar", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarHorarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data as {
    turmaId: number;
    aulaspordia?: number;
    substituir?: boolean;
    reduzirJanelas?: boolean;
    fatorPedagogico?: boolean;
    compactarCargaHoraria?: boolean;
    experimental?: boolean;
    nomeExperimental?: string;
  };

  try {
    const result = await gerarAlgoritmoMelhorTentativa({
      escolaId,
      turmaId: data.turmaId,
      aulaspordia: data.aulaspordia,
      substituir: data.substituir ?? false,
      reduzirJanelas: data.reduzirJanelas ?? false,
      fatorPedagogico: data.fatorPedagogico ?? false,
      compactarCargaHoraria: data.compactarCargaHoraria ?? false,
      experimental: data.experimental ?? false,
      nomeExperimental: data.nomeExperimental,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Erro ao gerar horário" });
  }
});

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = ListHorariosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turmaId, professorId } = parsed.data as { turmaId?: number; professorId?: number };

  const condicoes = [eq(horariosTable.escolaId, escolaId)];
  if (turmaId) condicoes.push(eq(horariosTable.turmaId, turmaId));
  if (professorId) condicoes.push(eq(horariosTable.professorId, professorId));

  const slots = await db.select().from(horariosTable)
    .where(and(...condicoes))
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);

  if (slots.length === 0) {
    res.json([]);
    return;
  }

  const disciplinaIds = [...new Set(slots.map(s => s.disciplinaId))];
  const professorIds = [...new Set(slots.map(s => s.professorId))];
  const turmaIds = [...new Set(slots.map(s => s.turmaId))];

  const [disciplinas, professores, turmas] = await Promise.all([
    db.select().from(disciplinasTable).where(inArray(disciplinasTable.id, disciplinaIds)),
    db.select().from(professoresTable).where(inArray(professoresTable.id, professorIds)),
    db.select().from(turmasTable).where(inArray(turmasTable.id, turmaIds)),
  ]);
  const discMap = new Map(disciplinas.map(d => [d.id, d]));
  const profMap = new Map(professores.map(p => [p.id, p]));
  const turmaMap = new Map(turmas.map(t => [t.id, t]));

  const enriched = slots.map(s => ({
    ...s,
    disciplina: discMap.get(s.disciplinaId),
    professor: profMap.get(s.professorId),
    turma: turmaMap.get(s.turmaId),
  }));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CreateHorarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data as {
    turmaId: number;
    disciplinaId: number;
    professorId: number;
    diaSemana: number;
    numeroAula: number;
    sala?: string;
  };

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, data.turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }

  const existing = await db.select().from(horariosTable)
    .where(and(
      eq(horariosTable.turmaId, data.turmaId),
      eq(horariosTable.diaSemana, data.diaSemana),
      eq(horariosTable.numeroAula, data.numeroAula),
      eq(horariosTable.escolaId, escolaId),
    ))
    .then(r => r[0]);

  if (existing) {
    res.status(409).json({ error: "Já existe um horário neste slot para esta turma" });
    return;
  }

  // [FIX] Validação de domínio: bloqueia inserção manual de período inexistente
  // no esquema desta turma — a mesma classe de falha que gerou dados inválidos
  // silenciosamente no incidente documentado (turma 2B, períodos 7–11).
  const validacao = await assertPeriodoValido(data.turmaId, data.numeroAula, escolaId);
  if (!validacao.ok) {
    res.status(422).json({ error: validacao.erro, periodosValidos: validacao.periodosValidos });
    return;
  }

  const [slot] = await db.insert(horariosTable).values({ ...data, escolaId }).returning();
  const enriched = await enrichSlot(slot);
  res.status(201).json(enriched);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DeleteHorarioParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  await db.delete(horariosTable)
    .where(and(eq(horariosTable.id, parsed.data.id), eq(horariosTable.escolaId, escolaId)));
  res.status(204).send();
});

// ── EXPERIMENTAIS ────────────────────────────────────────────────────

const ExpInput = z.object({
  nome: z.string().min(1),
  turmaId: z.number().int(),
  disciplinaId: z.number().int(),
  professorId: z.number().int(),
  diaSemana: z.number().int().min(0).max(4),
  // [FIX] Removido .max(8) hardcoded — o limite real varia por turno/nível de ensino.
  // Validação dinâmica feita por assertPeriodoValido() logo após o parse do body.
  numeroAula: z.number().int().min(1),
  sala: z.string().optional(),
});

router.get("/experimentais", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = req.query.turmaId ? Number(req.query.turmaId) : undefined;
  let rows = await db.select().from(horariosExperimentaisTable)
    .where(eq(horariosExperimentaisTable.escolaId, escolaId))
    .orderBy(horariosExperimentaisTable.nome, horariosExperimentaisTable.diaSemana, horariosExperimentaisTable.numeroAula);
  if (turmaId) rows = rows.filter(r => r.turmaId === turmaId);
  res.json(rows);
});

router.post("/experimentais", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = ExpInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, parsed.data.turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }

  // [FIX] Validação de domínio na inserção manual de slot experimental
  const validacaoExp = await assertPeriodoValido(parsed.data.turmaId, parsed.data.numeroAula, escolaId);
  if (!validacaoExp.ok) {
    res.status(422).json({ error: validacaoExp.erro, periodosValidos: validacaoExp.periodosValidos });
    return;
  }

  const [slot] = await db.insert(horariosExperimentaisTable).values({ ...parsed.data, escolaId }).returning();
  res.status(201).json(slot);
});

router.post("/experimentais/:nome/promover", async (req, res) => {
  const escolaId = getEscolaId(req);
  const nome = req.params.nome;
  const expSlots = await db.select().from(horariosExperimentaisTable)
    .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));

  if (expSlots.length === 0) {
    res.status(404).json({ error: "Horário experimental não encontrado" });
    return;
  }

  const turmaIds = [...new Set(expSlots.map(s => s.turmaId))];

  // [FIX] Validação de domínio em lote antes de promover: garante que nenhum
  // slot do experimento tem um período que não existe no esquema atual da turma.
  // Valida cada turmaId UMA vez (via Set de períodos do banco), não slot por slot.
  const periodosPorTurma = new Map<number, Set<number>>();
  for (const tid of turmaIds) {
    periodosPorTurma.set(tid, await periodosValidosDaTurma(tid, escolaId));
  }
  const violacoes = expSlots.filter(s => {
    const validos = periodosPorTurma.get(s.turmaId);
    return validos && validos.size > 0 && !validos.has(s.numeroAula);
  });
  if (violacoes.length > 0) {
    res.status(422).json({
      error: "Não é possível promover: o experimento contém slots com períodos inválidos para o esquema atual da turma.",
      violacoes: violacoes.map(s => ({
        turmaId: s.turmaId,
        disciplinaId: s.disciplinaId,
        diaSemana: s.diaSemana,
        numeroAula: s.numeroAula,
        periodosValidos: [...(periodosPorTurma.get(s.turmaId) ?? [])].sort((a, b) => a - b),
      })),
    });
    return;
  }

  const linhas = expSlots.map((s) => ({
    escolaId,
    turmaId: s.turmaId,
    disciplinaId: s.disciplinaId,
    professorId: s.professorId,
    diaSemana: s.diaSemana,
    numeroAula: s.numeroAula,
    sala: s.sala,
  }));

  const inserted = await db.transaction(async (tx) => {
    for (const turmaId of turmaIds) {
      await tx.delete(horariosTable)
        .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));
    }
    const gravados = await tx.insert(horariosTable).values(linhas).returning();
    await tx.delete(horariosExperimentaisTable)
      .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
    return gravados;
  });

  res.json({ slotsGerados: inserted.length, conflitos: [], horario: [] });
});

router.delete("/experimentais/:nome", async (req, res) => {
  const escolaId = getEscolaId(req);
  await db.delete(horariosExperimentaisTable)
    .where(and(eq(horariosExperimentaisTable.nome, req.params.nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
  res.status(204).send();
});

// ── GERAÇÃO EM MASSA ─────────────────────────────────────────────────

const GerarLoteBody = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]).optional(),
  nomeExperimental: z.string().min(1),
  reduzirJanelas: z.boolean().optional(),
  fatorPedagogico: z.boolean().optional(),
  compactarCargaHoraria: z.boolean().optional(),
});

router.post("/gerar-lote", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarLoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turno, nomeExperimental, reduzirJanelas, fatorPedagogico, compactarCargaHoraria } = parsed.data;

  let turmasAlvo = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  if (turno) turmasAlvo = turmasAlvo.filter(t => t.turno === turno);

  if (turmasAlvo.length === 0) {
    res.status(400).json({ error: turno ? `Nenhuma turma encontrada no turno "${turno}"` : "Nenhuma turma cadastrada" });
    return;
  }

  const turmaIdsAlvo = turmasAlvo.map((t) => t.id);
  await db.delete(horariosExperimentaisTable).where(and(
    eq(horariosExperimentaisTable.escolaId, escolaId),
    eq(horariosExperimentaisTable.nome, nomeExperimental),
    inArray(horariosExperimentaisTable.turmaId, turmaIdsAlvo),
  ));

  const resultados: Array<{ turmaId: number; turmaNome: string; slotsGerados: number; conflitos: string[]; erro?: string }> = [];
  for (const turma of turmasAlvo) {
    try {
      const r = await gerarAlgoritmoMelhorTentativa({
        escolaId,
        turmaId: turma.id,
        substituir: true,
        reduzirJanelas: reduzirJanelas ?? true,
        fatorPedagogico: fatorPedagogico ?? false,
        compactarCargaHoraria: compactarCargaHoraria ?? false,
        experimental: true,
        nomeExperimental,
      });
      resultados.push({ turmaId: turma.id, turmaNome: turma.nome, slotsGerados: r.slotsGerados, conflitos: r.conflitos });
    } catch (err) {
      resultados.push({
        turmaId: turma.id, turmaNome: turma.nome, slotsGerados: 0, conflitos: [],
        erro: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  const totalSlots = resultados.reduce((s, r) => s + r.slotsGerados, 0);
  const totalConflitos = resultados.reduce((s, r) => s + r.conflitos.length, 0);
  const turmasComErro = resultados.filter(r => r.erro);

  res.json({
    nomeExperimental,
    totalTurmas: turmasAlvo.length,
    totalSlots,
    totalConflitos,
    turmasComErro: turmasComErro.length,
    resultados,
  });
});

const GerarProfessorBody = z.object({
  professorId: z.number().int(),
  reduzirJanelas: z.boolean().optional(),
  fatorPedagogico: z.boolean().optional(),
  compactarCargaHoraria: z.boolean().optional(),
});

router.post("/gerar-professor", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { professorId, reduzirJanelas, fatorPedagogico, compactarCargaHoraria } = parsed.data;

  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const [slotsAtuais, vinculos, turmasDaEscola] = await Promise.all([
    db.select({ turmaId: horariosTable.turmaId }).from(horariosTable)
      .where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.professorId, professorId))),
    db.select({ turmaId: turmaDisciplinasTable.turmaId }).from(turmaDisciplinasTable)
      .where(eq(turmaDisciplinasTable.professorId, professorId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);

  const turmaIdsValidosDaEscola = new Set(turmasDaEscola.map((t) => t.id));
  const turmaIds = [...new Set([...slotsAtuais.map((s) => s.turmaId), ...vinculos.map((v) => v.turmaId)])]
    .filter((id) => turmaIdsValidosDaEscola.has(id));

  if (turmaIds.length === 0) {
    res.status(400).json({ error: "Este professor não está vinculado a nenhuma turma (nem por aula já alocada, nem por disciplina cadastrada)" });
    return;
  }

  const nomeExperimental = `Regen-${professor.nome.split(" ")[0]}-${new Date().toISOString().split("T")[0]}`;

  const resultados: Array<{ turmaId: number; turmaNome: string; slotsGerados: number; conflitos: string[]; erro?: string }> = [];
  for (const turmaId of turmaIds) {
    const turma = turmasDaEscola.find((t) => t.id === turmaId);
    try {
      const r = await gerarAlgoritmo({
        escolaId,
        turmaId,
        substituir: true,
        reduzirJanelas: reduzirJanelas ?? true,
        fatorPedagogico: fatorPedagogico ?? false,
        compactarCargaHoraria: compactarCargaHoraria ?? false,
        experimental: true,
        nomeExperimental,
        apenasProfessorId: professorId,
      });
      resultados.push({ turmaId, turmaNome: turma?.nome ?? String(turmaId), slotsGerados: r.slotsGerados, conflitos: r.conflitos });
    } catch (err) {
      resultados.push({
        turmaId, turmaNome: turma?.nome ?? String(turmaId), slotsGerados: 0, conflitos: [],
        erro: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  res.json({
    professorId,
    professorNome: professor.nome,
    nomeExperimental,
    totalTurmas: turmaIds.length,
    resultados,
  });
});

const CorrigirProfessorBody = z.object({
  professorId: z.number().int(),
});

router.post("/corrigir-professor", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CorrigirProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { professorId } = parsed.data;

  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const [todosSlotsDaEscola, disponibilidades, turmasDaEscola, horarioSlotsTodos] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);

  const turnoPorTurmaId = new Map(turmasDaEscola.map((t) => [t.id, t.turno]));
  const slotsDoProf = todosSlotsDaEscola.filter((s) => s.professorId === professorId);

  const indisponivelSet = new Set(
    disponibilidades.filter((d) => !d.disponivel).map((d) => `${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`),
  );

  const conflitantes = slotsDoProf.filter((s) => {
    const turno = turnoPorTurmaId.get(s.turmaId) ?? "desconhecido";
    return indisponivelSet.has(`${turno}-${s.diaSemana}-${s.numeroAula}`);
  });

  if (conflitantes.length === 0) {
    res.json({
      professorId, professorNome: professor.nome, movidas: [], naoResolvidas: [],
      mensagem: "Nenhuma aula deste professor está em conflito com a disponibilidade atual — nada pra corrigir.",
    });
    return;
  }

  const movidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; de: { dia: number; aula: number }; para: { dia: number; aula: number } }> = [];
  const naoResolvidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; dia: number; aula: number; motivo: string }> = [];

  const ocupadoProfAtual = new Set(
    todosSlotsDaEscola.map((s) => `${s.professorId}-${turnoPorTurmaId.get(s.turmaId) ?? "desconhecido"}-${s.diaSemana}-${s.numeroAula}`),
  );
  const ocupadoTurmaAtual = new Set(todosSlotsDaEscola.map((s) => `${s.turmaId}-${s.diaSemana}-${s.numeroAula}`));

  const DIAS = [0, 1, 2, 3, 4];

  for (const slot of conflitantes) {
    const turma = turmasDaEscola.find((t) => t.id === slot.turmaId);
    const turno = turnoPorTurmaId.get(slot.turmaId) ?? "desconhecido";
    const nivel = turma?.nivelEnsino ?? null;
    const aulasDoTurno = horarioSlotsTodos
      .filter((hs) => hs.turno === turno && (turno !== "matutino" || hs.nivelEnsino === nivel))
      .map((hs) => hs.numeroAula)
      .filter((n) => n >= 1);

    let destino: { dia: number; aula: number } | null = null;
    for (const dia of DIAS) {
      for (const aula of aulasDoTurno) {
        if (dia === slot.diaSemana && aula === slot.numeroAula) continue;
        const chaveProf = `${professorId}-${turno}-${dia}-${aula}`;
        const chaveTurma = `${slot.turmaId}-${dia}-${aula}`;
        if (ocupadoProfAtual.has(chaveProf)) continue;
        if (ocupadoTurmaAtual.has(chaveTurma)) continue;
        if (indisponivelSet.has(`${turno}-${dia}-${aula}`)) continue;
        destino = { dia, aula };
        break;
      }
      if (destino) break;
    }

    if (!destino) {
      naoResolvidas.push({
        turmaId: slot.turmaId, turmaNome: turma?.nome ?? String(slot.turmaId),
        disciplinaId: slot.disciplinaId, dia: slot.diaSemana, aula: slot.numeroAula,
        motivo: "Não encontrei nenhum horário livre nessa turma, na semana toda, em que o professor esteja disponível.",
      });
      continue;
    }

    await db.update(horariosTable)
      .set({ diaSemana: destino.dia, numeroAula: destino.aula })
      .where(eq(horariosTable.id, slot.id));

    ocupadoProfAtual.delete(`${professorId}-${turno}-${slot.diaSemana}-${slot.numeroAula}`);
    ocupadoProfAtual.add(`${professorId}-${turno}-${destino.dia}-${destino.aula}`);
    ocupadoTurmaAtual.delete(`${slot.turmaId}-${slot.diaSemana}-${slot.numeroAula}`);
    ocupadoTurmaAtual.add(`${slot.turmaId}-${destino.dia}-${destino.aula}`);

    movidas.push({
      turmaId: slot.turmaId, turmaNome: turma?.nome ?? String(slot.turmaId),
      disciplinaId: slot.disciplinaId, de: { dia: slot.diaSemana, aula: slot.numeroAula }, para: destino,
    });
  }

  res.json({ professorId, professorNome: professor.nome, movidas, naoResolvidas });
});

// ── GERAÇÃO COM CP-SAT (OR-Tools) ───────────────────────────────────
//
// Chama o microserviço Python (cpsat-service/, deployado como Web
// Service separado no Render) que resolve a grade com o solver CP-SAT
// em vez do heurístico acima. Validado com dados reais dos 3 turnos
// antes desta integração (ver spike-cp-sat/) -- todos OPTIMAL em
// menos de 1s.
//
// Sempre grava como EXPERIMENTO (nunca direto na grade oficial), pelo
// mesmo motivo documentado em /gerar-professor: é motor novo, ainda
// não testado em produção com a escola real, então qualquer resultado
// precisa passar por revisão humana antes de virar oficial (via
// /experimentais/:nome/promover, que já existe).
//
// Limitação assumida aqui (mesma do script de export que gerou os
// dados de validação): usa TODOS os slots de horário do turno sem
// diferenciar por nível de ensino -- se o matutino tiver turmas de
// Fundamental E Médio com esquemas de aula diferentes ao mesmo tempo,
// isso pode precisar de ajuste antes de usar em produção real.

const CPSAT_SERVICE_URL = process.env.CPSAT_SERVICE_URL || "https://nexgrade-cpsat.onrender.com";

const GerarCpsatBody = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]).optional(),
  turmaId: z.number().int().positive().optional(),
  nomeExperimental: z.string().min(1),
  tempoLimiteS: z.number().int().positive().optional(),
}).refine((data) => (data.turno != null) !== (data.turmaId != null), {
  message: "Informe turno OU turmaId (exatamente um dos dois, não os dois nem nenhum).",
});

router.post("/gerar-cpsat", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarCpsatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turno: turnoInformado, turmaId, nomeExperimental, tempoLimiteS } = parsed.data;

  let turno: "matutino" | "vespertino" | "noturno";
  let turmasDoTurno: (typeof turmasTable.$inferSelect)[];

  if (turmaId != null) {
    // Escopo por turma única -- confirma que a turma existe E pertence
    // a esta escola antes de qualquer outra coisa (mesma checagem de
    // segurança que o modo por turno já fazia via escolaId).
    const [turmaEscolhida] = await db.select().from(turmasTable)
      .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)));
    if (!turmaEscolhida) {
      res.status(400).json({ error: `Turma #${turmaId} não encontrada para esta escola.` });
      return;
    }
    turmasDoTurno = [turmaEscolhida];
    turno = turmaEscolhida.turno as "matutino" | "vespertino" | "noturno";
  } else {
    turno = turnoInformado!;
    turmasDoTurno = await db.select().from(turmasTable)
      .where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.turno, turno)));
    if (turmasDoTurno.length === 0) {
      res.status(400).json({ error: `Nenhuma turma encontrada no turno "${turno}"` });
      return;
    }
  }
  const turmaIds = turmasDoTurno.map((t) => t.id);

  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),
    db.select().from(professorDisciplinasTable),
  ]);

  if (turmaDiscsTodos.length === 0) {
    res.status(400).json({ error: "Nenhuma disciplina cadastrada para as turmas deste turno" });
    return;
  }

  const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));
  const professorMap = new Map(professoresTodos.map((p) => [p.id, p]));
  const turmaMap = new Map(turmasDoTurno.map((t) => [t.id, t]));

  // Chave usada pra mapear a resposta do CP-SAT (que só devolve nomes,
  // não IDs) de volta pros IDs reais do banco. Mesma convenção usada
  // em scripts/exportar-dados-cpsat.ts, já validada com dados reais.
  const chaveParaIds = new Map<string, { turmaId: number; disciplinaId: number }>();
  const nomeParaProfessorId = new Map<string, number>();
  professoresTodos.forEach((p) => nomeParaProfessorId.set(p.nome, p.id));

  // [FIX] Quando turma_disciplinas.professorId e nulo (caso das aulas
  // "Hibrida", entre outras), o motor heuristico ja resolve isso via
  // professor_disciplinas (vinculo generico professor<->disciplina).
  // O CP-SAT precisa do mesmo fallback -- sem ele, a linha inteira era
  // descartada e a aula sumia da grade gerada (constatado comparando
  // com a carga horaria real do PDF da escola: toda turma com entrada
  // "Hibrida" ficava faltando exatamente 1 aula). Quando ha mais de um
  // candidato no pool generico, prioriza o professor cujo nome contem
  // "(<nome da turma>)" -- convencao ja usada nos professores virtuais
  // Hibrida (1NB), Hibrida (2NB) etc. -- e cai pro primeiro candidato
  // do pool se nao achar esse padrao.
  function resolverProfessor(td: typeof turmaDiscsTodos[number], turma: typeof turmasDoTurno[number]) {
    if (td.professorId != null) return professorMap.get(td.professorId) ?? null;
    const candidatos = profDiscsTodos
      .filter((pd) => pd.disciplinaId === td.disciplinaId)
      .map((pd) => professorMap.get(pd.professorId))
      .filter((p): p is NonNullable<typeof p> => p != null);
    const porNomeTurma = candidatos.find((p) => p.nome.includes(`(${turma.nome})`));
    return porNomeTurma ?? candidatos[0] ?? null;
  }

  const semProfessorResolvido: Array<{ turma: string; disciplina: string }> = [];

  const disciplinasTurma = turmaDiscsTodos
    .map((td) => {
      const turma = turmaMap.get(td.turmaId)!;
      const disc = disciplinaMap.get(td.disciplinaId);
      const prof = resolverProfessor(td, turma);
      if (!prof) {
        semProfessorResolvido.push({ turma: turma.nome, disciplina: disc?.nome ?? `Disciplina #${td.disciplinaId}` });
        return null;
      }
      const codigoSae = disc?.codigoSae ?? disc?.sigla ?? String(td.disciplinaId);
      chaveParaIds.set(`${turma.nome}||${codigoSae}`, { turmaId: td.turmaId, disciplinaId: td.disciplinaId });
      return {
        turma: turma.nome,
        codigoSae,
        nome: disc?.nome ?? `Disciplina #${td.disciplinaId}`,
        aulasSemana: td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,
        professor: prof.nome,
        maxAulasDia: td.maxAulasConsecutivasDia ?? 2,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .filter((d) => d.aulasSemana > 0);

  if (disciplinasTurma.length === 0) {
    res.status(400).json({ error: "Nenhuma disciplina com carga horária > 0 e professor definido para este turno" });
    return;
  }

  const professorIdsUsados = new Set(disciplinasTurma.map((d) => nomeParaProfessorId.get(d.professor)).filter((id): id is number => id != null));
  const bloqueiosDisponibilidade = disponibilidades
    .filter((d) => professorIdsUsados.has(d.professorId) && !d.disponivel && (d.turno === turno || d.turno == null))
    .map((d) => ({
      professor: professorMap.get(d.professorId)?.nome ?? `Professor #${d.professorId}`,
      dia: d.diaSemana,
      aula: d.horarioSlot,
    }));

  // [FIX] Bloqueia tambem os horarios em que o professor JA esta
  // comprometido em OUTRA turma do mesmo turno -- seja na grade oficial
  // ja promovida, seja em outro experimento ainda ativo. Sem isso, gerar
  // turma por turma (modo "Turma (Beta)") cria conflitos de professor
  // entre turmas, porque cada chamada resolve isoladamente sem saber
  // nada sobre as demais.
  const outrasTurmasDoTurno = await db.select({ id: turmasTable.id })
    .from(turmasTable)
    .where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.turno, turno)));
  const outrasTurmaIds = outrasTurmasDoTurno.map((t) => t.id).filter((id) => !turmaIds.includes(id));

  let bloqueiosOutrasTurmas: Array<{ professor: string; dia: number; aula: number }> = [];
  if (outrasTurmaIds.length > 0 && professorIdsUsados.size > 0) {
    const [ocupadosOficial, ocupadosExperimental] = await Promise.all([
      db.select({ professorId: horariosTable.professorId, dia: horariosTable.diaSemana, aula: horariosTable.numeroAula })
        .from(horariosTable)
        .where(and(
          eq(horariosTable.escolaId, escolaId),
          inArray(horariosTable.turmaId, outrasTurmaIds),
          inArray(horariosTable.professorId, [...professorIdsUsados]),
        )),
      db.select({ professorId: horariosExperimentaisTable.professorId, dia: horariosExperimentaisTable.diaSemana, aula: horariosExperimentaisTable.numeroAula })
        .from(horariosExperimentaisTable)
        .where(and(
          eq(horariosExperimentaisTable.escolaId, escolaId),
          inArray(horariosExperimentaisTable.turmaId, outrasTurmaIds),
          inArray(horariosExperimentaisTable.professorId, [...professorIdsUsados]),
        )),
    ]);
    bloqueiosOutrasTurmas = [...ocupadosOficial, ...ocupadosExperimental].map((o) => ({
      professor: professorMap.get(o.professorId!)?.nome ?? `Professor #${o.professorId}`,
      dia: o.dia,
      aula: o.aula,
    }));
  }

  const bloqueiosProfessor = [...bloqueiosDisponibilidade, ...bloqueiosOutrasTurmas];

  const aulasPorDia = horarioSlotsTurno.length > 0
    ? Math.max(...horarioSlotsTurno.map((s) => s.numeroAula))
    : 6;

  const payload = {
    turno,
    aulasPorDia,
    turmas: turmasDoTurno.map((t) => ({ nome: t.nome, turno: t.turno })),
    disciplinasTurma,
    bloqueiosProfessor,
    tempoLimiteS: tempoLimiteS ?? 120,
  };

  let resultado: {
    status: string;
    otimo: boolean;
    viavel: boolean;
    tempoResolucaoS: number;
    mensagem?: string;
    aulas: Array<{ turma: string; codigoSae: string; disciplina: string; professor: string; dia: number; aula: number }>;
  };

  try {
    const controller = new AbortController();
    const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${CPSAT_SERVICE_URL}/gerar-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Serviço CP-SAT respondeu ${response.status}: ${errBody}`);
    }
    resultado = (await response.json()) as typeof resultado;
  } catch (err) {
    res.status(502).json({
      error: "Não foi possível gerar a grade com o motor CP-SAT.",
      detalhe: err instanceof Error ? err.message : String(err),
      dica: "Verifique se o serviço nexgrade-cpsat está no ar (pode estar hibernado se estiver no free tier do Render).",
    });
    return;
  }

  if (!resultado.viavel) {
    res.status(422).json({
      error: "INVIÁVEL",
      status: resultado.status,
      mensagem: resultado.mensagem ?? "Não existe grade possível com os dados atuais.",
    });
    return;
  }

  await db.delete(horariosExperimentaisTable).where(and(
    eq(horariosExperimentaisTable.escolaId, escolaId),
    eq(horariosExperimentaisTable.nome, nomeExperimental),
    inArray(horariosExperimentaisTable.turmaId, turmaIds),
  ));

  const linhasParaGravar: Array<{
    escolaId: string; nome: string; turmaId: number; disciplinaId: number;
    professorId: number; diaSemana: number; numeroAula: number;
  }> = [];
  const naoMapeadas: typeof resultado.aulas = [];

  for (const aula of resultado.aulas) {
    const ids = chaveParaIds.get(`${aula.turma}||${aula.codigoSae}`);
    const professorId = nomeParaProfessorId.get(aula.professor);
    if (!ids || !professorId) {
      naoMapeadas.push(aula);
      continue;
    }
    linhasParaGravar.push({
      escolaId,
      nome: nomeExperimental,
      turmaId: ids.turmaId,
      disciplinaId: ids.disciplinaId,
      professorId,
      diaSemana: aula.dia,
      numeroAula: aula.aula,
    });
  }

  if (linhasParaGravar.length === 0) {
    res.status(500).json({
      error: "O CP-SAT devolveu uma grade, mas nenhuma aula pôde ser mapeada de volta para os IDs do banco.",
      naoMapeadas,
    });
    return;
  }

  const gravados = await db.insert(horariosExperimentaisTable).values(linhasParaGravar).returning();

  res.json({
    nomeExperimental,
    turno,
    status: resultado.status,
    otimo: resultado.otimo,
    tempoResolucaoS: resultado.tempoResolucaoS,
    totalTurmas: turmasDoTurno.length,
    totalSlots: gravados.length,
    naoMapeadas: naoMapeadas.length,
    semProfessorResolvido: semProfessorResolvido.length,
    ...(naoMapeadas.length > 0 ? { detalheNaoMapeadas: naoMapeadas } : {}),
    ...(semProfessorResolvido.length > 0 ? { detalheSemProfessorResolvido: semProfessorResolvido } : {}),
    mensagem: `Grade gerada como experimento "${nomeExperimental}". Revise e use POST /experimentais/${nomeExperimental}/promover para aplicar como oficial.`,
  });
});

export default router;
