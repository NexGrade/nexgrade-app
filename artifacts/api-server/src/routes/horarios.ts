import { Router } from "express";
import axios from "axios";
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
  itensMatrizTable,
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
import { randomUUID } from "node:crypto";
import { recalcularHoraAtividade } from "../lib/recalcular-ha";

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
  apenasProfessorId?: number;
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
  const slotsDoTurno = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turma.turno), condicaoNivel));
  if (slotsDoTurno.length === 0) {
    throw new Error(
      `Nenhum esquema de horário configurado para o turno "${turma.turno}"` +
      (turma.turno === "matutino" ? ` (nível: ${turma.nivelEnsino})` : "") +
      ". Configure o esquema de horários antes de gerar.",
    );
  }
  const AULAS_VALIDAS_TURMA = new Set(slotsDoTurno.filter(s => s.letivo).map(s => s.numeroAula));

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
    .filter(d => !d.disponivel || d.horaAtividadeObrigatoria)
    .forEach(d => {
      const chaveTurnoDisp = d.turno ?? "null";
      indisponivelProf[`${d.professorId}-${chaveTurnoDisp}-${d.diaSemana}-${d.horarioSlot}`] = true;
    });
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

  return new Set(slots.filter(s => s.letivo).map(s => s.numeroAula));
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
    [0, 1, 2, 3, 4],
    [1, 3, 2, 4, 0],
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
    if (!(data.experimental ?? false)) {
      try {
        await recalcularHoraAtividade(escolaId);
      } catch (errHA) {
        console.error("[HA] Falha ao recalcular hora-atividade apos geracao direta:", errHA);
      }
    }
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

  try {
    await recalcularHoraAtividade(escolaId);
  } catch (err) {
    console.error("[HA] Falha ao recalcular hora-atividade apos promover:", err);
  }

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
    disponibilidades.filter((d) => !d.disponivel || d.horaAtividadeObrigatoria).map((d) => `${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`),
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
      .filter((hs) => hs.turno === turno && (turno !== "matutino" || hs.nivelEnsino === nivel) && hs.letivo)
      .map((hs) => hs.numeroAula);

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

  if (movidas.length > 0) {
    try {
      await recalcularHoraAtividade(escolaId);
    } catch (err) {
      console.error("[HA] Falha ao recalcular hora-atividade apos corrigir-professor:", err);
    }
  }

  res.json({ professorId, professorNome: professor.nome, movidas, naoResolvidas });
});

// ── GERAÇÃO COM CP-SAT (OR-Tools) ───────────────────────────────────

const CPSAT_SERVICE_URL = process.env.CPSAT_SERVICE_URL || "https://nexgrade-cpsat.onrender.com";

async function aguardarCpsatServiceAcordado(maxEsperaMs = 90_000): Promise<void> {
  const inicio = Date.now();
  while (Date.now() - inicio < maxEsperaMs) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${CPSAT_SERVICE_URL}/`, { signal: controller.signal }); // [FIX-HEALTHZ] nexgrade-cpsat so tem "/" e "/gerar-grade" -- "/api/healthz" nunca existiu nesse servico, sempre dava 404 e desperdicava ate 90s por geracao.
      clearTimeout(timeoutId);
      if (response.ok) return;
    } catch {
      // Ainda hibernado/acordando (ou instavel) -- tenta de novo.
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

const GerarCpsatBody = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]).optional(),
  turmaId: z.number().int().positive().optional(),
  turmaIds: z.array(z.number().int().positive()).min(1).optional(),
  nomeExperimental: z.string().min(1),
  tempoLimiteS: z.number().int().positive().optional(),
}).refine((data) => {
  const opcoesInformadas = [data.turno != null, data.turmaId != null, data.turmaIds != null].filter(Boolean).length;
  return opcoesInformadas === 1;
}, {
  message: "Informe turno, turmaId OU turmaIds (exatamente uma das tres opcoes, nao mais de uma nem nenhuma).",
});

async function runCpsatGeneration(
  escolaId: string,
  turnoInformado: "matutino" | "vespertino" | "noturno" | undefined,
  turmaId: number | undefined,
  turmaIdsSelecionados: number[] | undefined,
  nomeExperimental: string,
  tempoLimiteS: number | undefined,
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  let turno: "matutino" | "vespertino" | "noturno";
  let turmasDoTurno: (typeof turmasTable.$inferSelect)[];

  if (turmaId != null) {
    const [turmaEscolhida] = await db.select().from(turmasTable)
      .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)));
    if (!turmaEscolhida) {
      return { httpStatus: 400, body: { error: `Turma #${turmaId} nao encontrada para esta escola.` } };
    }
    turmasDoTurno = [turmaEscolhida];
    turno = turmaEscolhida.turno as "matutino" | "vespertino" | "noturno";
  } else if (turmaIdsSelecionados != null) {
    // [NOVO] Selecao de um subconjunto arbitrario de turmas (nao a turma
    // unica, nem o turno inteiro). Criado pra contornar o limite de
    // memoria do CP-SAT no free tier do Render: 24 turmas de uma vez
    // (turno inteiro do Mario Braga) estoura RAM e o servico reinicia
    // no meio do calculo (visto em producao: /api/healthz volta 404 por
    // ~1-2min, exatamente a assinatura de um OOM-restart do container).
    // Gerar um subconjunto menor (ex.: so os tecnicos, depois so o
    // Fundamental) reduz o tamanho do modelo o suficiente pra caber.
    const turmasEscolhidas = await db.select().from(turmasTable)
      .where(and(inArray(turmasTable.id, turmaIdsSelecionados), eq(turmasTable.escolaId, escolaId)));
    if (turmasEscolhidas.length === 0) {
      return { httpStatus: 400, body: { error: "Nenhuma das turmas informadas foi encontrada para esta escola." } };
    }
    if (turmasEscolhidas.length !== turmaIdsSelecionados.length) {
      const encontrados = new Set(turmasEscolhidas.map((t) => t.id));
      const faltando = turmaIdsSelecionados.filter((id) => !encontrados.has(id));
      return { httpStatus: 400, body: { error: `Turma(s) nao encontrada(s) para esta escola: ${faltando.join(", ")}` } };
    }
    const turnosDistintos = new Set(turmasEscolhidas.map((t) => t.turno));
    if (turnosDistintos.size > 1) {
      return {
        httpStatus: 400,
        body: { error: `As turmas selecionadas pertencem a turnos diferentes (${[...turnosDistintos].join(", ")}). O CP-SAT gera um turno por vez -- selecione turmas do mesmo turno.` },
      };
    }
    turmasDoTurno = turmasEscolhidas;
    turno = turmasEscolhidas[0].turno as "matutino" | "vespertino" | "noturno";
  } else {
    turno = turnoInformado!;
    // [FIX] Exclui turmas fantasma (ex.: PAEE) -- elas nao tem aluno
    // de verdade e nao devem entrar na geracao de grade via CP-SAT.
    // Sem esse filtro, o solver tenta encaixar tambem as aulas de
    // PAEE junto com a curricular real, tornando o problema muito
    // mais dificil sem necessidade (visto em producao: geracao que
    // levava segundos passou a nao terminar nem em 400s).
    turmasDoTurno = await db.select().from(turmasTable)
      .where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.turno, turno), eq(turmasTable.fantasma, false)));
    if (turmasDoTurno.length === 0) {
      return { httpStatus: 400, body: { error: `Nenhuma turma encontrada no turno "${turno}"` } };
    }
  }
  const turmaIds = turmasDoTurno.map((t) => t.id);

  const matrizIdsAlvo = [...new Set(turmasDoTurno.map((t) => t.matrizCurricularId).filter((id): id is number => id != null))];
  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos, itensMatrizTodos] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),
    db.select().from(professorDisciplinasTable),
    matrizIdsAlvo.length > 0 ? db.select().from(itensMatrizTable).where(inArray(itensMatrizTable.matrizCurricularId, matrizIdsAlvo)) : Promise.resolve([]),
  ]);

  if (turmaDiscsTodos.length === 0) {
    return { httpStatus: 400, body: { error: "Nenhuma disciplina cadastrada para as turmas deste turno" } };
  }

  const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));
  const itensMatrizMap = new Map(itensMatrizTodos.map((im) => [`${im.matrizCurricularId}-${im.disciplinaId}`, im]));
  const professorMap = new Map(professoresTodos.map((p) => [p.id, p]));
  const turmaMap = new Map(turmasDoTurno.map((t) => [t.id, t]));

  const chaveParaIds = new Map<string, { turmaId: number; disciplinaId: number }>();
  const nomeParaProfessorId = new Map<string, number>();
  professoresTodos.forEach((p) => nomeParaProfessorId.set(p.nome, p.id));

  function resolverProfessor(td: typeof turmaDiscsTodos[number], turma: typeof turmasDoTurno[number]) {
    if (td.professorId != null) return professorMap.get(td.professorId) ?? null;
    const candidatos = profDiscsTodos
      .filter((pd) => pd.disciplinaId === td.disciplinaId)
      .map((pd) => professorMap.get(pd.professorId))
      .filter((p): p is NonNullable<typeof p> => p != null);
    const porNomeTurma = candidatos.find((p) => p.nome.includes(`(${turma.nome})`));
    return porNomeTurma ?? null;
  }

  const configGeminadasCpsat = await db.select().from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_GEMINADAS_PADRAO)))
    .then((r) => r[0]);
  const maxGeminadasPadraoCpsat = typeof configGeminadasCpsat?.valor === "number" ? configGeminadasCpsat.valor : 2;

  const maxAulaPorNivelEnsino = new Map<string, number>();
  for (const slot of horarioSlotsTurno) {
    if (!slot.letivo) continue;
    const chave = slot.nivelEnsino ?? "__sem_nivel__";
    const atual = maxAulaPorNivelEnsino.get(chave) ?? 0;
    if (slot.numeroAula > atual) maxAulaPorNivelEnsino.set(chave, slot.numeroAula);
  }
  let maxAulaGlobalFallback = 0;
  for (const v of maxAulaPorNivelEnsino.values()) if (v > maxAulaGlobalFallback) maxAulaGlobalFallback = v;
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
        aulasSemana: td.cargaHorariaSemanalOverride ?? itensMatrizMap.get(`${turma.matrizCurricularId}-${td.disciplinaId}`)?.cargaHorariaSemanal ?? disc?.cargaSemanal ?? 0,
        professor: prof.nome,
        maxAulasDia: td.maxAulasConsecutivasDia ?? maxGeminadasPadraoCpsat,
        ultimaAulaTurma: maxAulaPorNivelEnsino.get(turma.nivelEnsino ?? "__sem_nivel__") ?? maxAulaGlobalFallback,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .filter((d) => d.aulasSemana > 0);

  if (disciplinasTurma.length === 0) {
    return { httpStatus: 400, body: { error: "Nenhuma disciplina com carga horaria > 0 e professor definido para este turno" } };
  }

  const professorIdsUsados = new Set(disciplinasTurma.map((d) => nomeParaProfessorId.get(d.professor)).filter((id): id is number => id != null));
  const bloqueiosDisponibilidade = disponibilidades
    .filter((d) => professorIdsUsados.has(d.professorId) && (!d.disponivel || d.horaAtividadeObrigatoria) && (d.turno === turno || d.turno == null))
    .map((d) => ({
      professor: professorMap.get(d.professorId)?.nome ?? `Professor #${d.professorId}`,
      dia: d.diaSemana,
      aula: d.horarioSlot,
    }));

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
  console.log("[DEBUG-CPSAT-PAYLOAD]", JSON.stringify(payload));

  let resultado:
    | {
        status: string;
        otimo: boolean;
        viavel: boolean;
        tempoResolucaoS: number;
        mensagem?: string;
        aulas: Array<{ turma: string; codigoSae: string; disciplina: string; professor: string; dia: number; aula: number }>;
      }
    | undefined;

  await aguardarCpsatServiceAcordado();

  const MAX_TENTATIVAS_CPSAT = 2;
  let ultimoErroCpsat: unknown = null;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_CPSAT; tentativa++) {
    try {
      const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
      // [FIX-AXIOS] Trocado fetch nativo (undici) por axios -- suspeita de
      // que o undici trava/falha silenciosamente com corpos de requisicao
      // medios/grandes (60KB+) na rede interna do Render, mesmo dentro do
      // timeout configurado. axios usa http/https nativos do Node.
      const axiosResponse = await axios.post(`${CPSAT_SERVICE_URL}/gerar-grade`, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      if (axiosResponse.status < 200 || axiosResponse.status >= 300) {
        throw new Error(`Servico CP-SAT respondeu ${axiosResponse.status}: ${JSON.stringify(axiosResponse.data)}`);
      }
      resultado = axiosResponse.data as typeof resultado;
      ultimoErroCpsat = null;
      break;
    } catch (err) {
      ultimoErroCpsat = err;
      const mensagemErroCpsat = err instanceof Error ? err.message : String(err);
      const pareceFalhaConexao =
        mensagemErroCpsat.includes("fetch failed") ||
        mensagemErroCpsat.includes("ECONNREFUSED") ||
        mensagemErroCpsat.includes("ETIMEDOUT") ||
        mensagemErroCpsat.includes("ECONNABORTED") ||
        mensagemErroCpsat.includes("ECONNRESET") ||
        mensagemErroCpsat.includes("timeout of");
      if (!pareceFalhaConexao || tentativa === MAX_TENTATIVAS_CPSAT) break;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  if (ultimoErroCpsat != null) {
    return {
      httpStatus: 502,
      body: {
        error: "Nao foi possivel gerar a grade com o motor CP-SAT.",
        detalhe: ultimoErroCpsat instanceof Error ? ultimoErroCpsat.message : String(ultimoErroCpsat),
        dica: "Verifique se o servico nexgrade-cpsat esta no ar (pode estar hibernado, ou ter reiniciado por falta de memoria se estiver no free tier do Render -- nesse caso, tente gerar um subconjunto menor de turmas).",
      },
    };
  }

  // [FIX-TS2454] Guarda explicita: sem isso, o TypeScript nao consegue
  // provar que `resultado` foi atribuido dentro do loop de tentativas
  // acima (a atribuicao acontece dentro de um try/catch dentro de um
  // for, fora do alcance da analise de fluxo do compilador). Na pratica
  // isso nunca deveria disparar -- se chegamos aqui com
  // ultimoErroCpsat == null, o loop terminou com sucesso e `resultado`
  // foi atribuido -- mas o guard deixa isso explicito pro compilador
  // (e vira uma rede de seguranca real caso essa premissa mude no futuro).
  if (resultado === undefined) {
    return {
      httpStatus: 500,
      body: { error: "Erro interno: o motor CP-SAT nao retornou resultado nem erro (estado inesperado)." },
    };
  }

  if (!resultado.viavel) {
    return {
      httpStatus: 422,
      body: {
        error: "INVIAVEL",
        status: resultado.status,
        mensagem: resultado.mensagem ?? "Nao existe grade possivel com os dados atuais.",
      },
    };
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
    return {
      httpStatus: 500,
      body: {
        error: "O CP-SAT devolveu uma grade, mas nenhuma aula pode ser mapeada de volta para os IDs do banco.",
        naoMapeadas,
      },
    };
  }

  const gravados = await db.insert(horariosExperimentaisTable).values(linhasParaGravar).returning();

  return {
    httpStatus: 200,
    body: {
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
    },
  };
}

router.post("/gerar-cpsat", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarCpsatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turno, turmaId, turmaIds, nomeExperimental, tempoLimiteS } = parsed.data;
  const resultado = await runCpsatGeneration(escolaId, turno, turmaId, turmaIds, nomeExperimental, tempoLimiteS);
  res.status(resultado.httpStatus).json(resultado.body);
});

interface CpsatJob {
  status: "running" | "done" | "error";
  escolaId: string;
  httpStatus?: number;
  body?: Record<string, unknown>;
  startedAt: number;
  finishedAt?: number;
}
const cpsatJobs = new Map<string, CpsatJob>();

function limparJobsCpsatAntigos() {
  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of cpsatJobs.entries()) {
    if (job.startedAt < umaHoraAtras) cpsatJobs.delete(id);
  }
}

router.post("/gerar-cpsat-async", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarCpsatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turno, turmaId, turmaIds, nomeExperimental, tempoLimiteS } = parsed.data;

  limparJobsCpsatAntigos();
  const jobId = randomUUID();
  cpsatJobs.set(jobId, { status: "running", escolaId, startedAt: Date.now() });

  void runCpsatGeneration(escolaId, turno, turmaId, turmaIds, nomeExperimental, tempoLimiteS)
    .then((resultado) => {
      const jobAtual = cpsatJobs.get(jobId);
      cpsatJobs.set(jobId, {
        status: resultado.httpStatus >= 200 && resultado.httpStatus < 300 ? "done" : "error",
        escolaId,
        httpStatus: resultado.httpStatus,
        body: resultado.body,
        startedAt: jobAtual?.startedAt ?? Date.now(),
        finishedAt: Date.now(),
      });
    })
    .catch((err) => {
      const jobAtual = cpsatJobs.get(jobId);
      cpsatJobs.set(jobId, {
        status: "error",
        escolaId,
        httpStatus: 500,
        body: { error: "Erro inesperado ao gerar a grade.", detalhe: err instanceof Error ? err.message : String(err) },
        startedAt: jobAtual?.startedAt ?? Date.now(),
        finishedAt: Date.now(),
      });
    });

  res.status(202).json({
    jobId,
    mensagem: "Geracao iniciada em segundo plano. Consulte o progresso em GET /api/horarios/gerar-cpsat-status/:jobId.",
  });
});

router.get("/gerar-cpsat-status/:jobId", (req, res) => {
  const escolaId = getEscolaId(req);
  const job = cpsatJobs.get(req.params.jobId);
  if (!job || job.escolaId !== escolaId) {
    res.status(404).json({ error: "Job nao encontrado (pode ter expirado ou pertencer a outra escola)." });
    return;
  }
  if (job.status === "running") {
    res.json({ jobStatus: "running" });
    return;
  }
  res.status(200).json({ jobStatus: job.status, httpStatusOriginal: job.httpStatus, ...job.body });
});

export default router;


