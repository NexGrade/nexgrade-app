// [INTERVALO-ENTRE-TURNOS] Regra (2026-10-01): professor com aula em dois turnos
// no mesmo dia precisa de intervalo entre eles. Se ele tem a 1a aula LETIVA do
// turno seguinte, a ULTIMA aula LETIVA do turno anterior nesse dia fica vaga
// (sem aula e sem HA). Par: matutino->vespertino (tarde->noite retirado em 2026-10-01).
//
// "Letiva": horario_slots com letivo != false (ex.: noturno aula 1 as 18:00 e so
// entrada em algumas escolas, nao conta como 1a aula).
//
// Como cada turno e gerado com os outros ja fixos (grade oficial), a regra vira
// um par proibido:
//   - gerando o turno ANTERIOR: bloqueia a ultima aula nos dias em que o
//     professor ja tem a 1a aula do turno seguinte;
//   - gerando o turno SEGUINTE: bloqueia a 1a aula nos dias em que o professor
//     ja tem a ultima aula do turno anterior.
import { db, horariosTable, turmasTable, horarioSlotsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { getEscolaId } from "./escola-id";
import { carregarAulasIntegraisNoTurno } from "./turno-integral"; // [INTERVALO-INTEGRAL]

type EscolaId = ReturnType<typeof getEscolaId>;

// [INTERVALO-DESLIGADO] (2026-10-01) regra DESATIVADA: deixou o vespertino inviavel
// no CP-SAT (INFEASIBLE). Lista vazia = nenhum bloqueio no CP-SAT, nenhuma restricao
// na HA e nenhum conflito. Historico: tarde->noite ja tinha saido antes (conflitos
// demais). Para religar so manha->tarde: [["matutino", "vespertino"]].
export const PARES_TURNO: ReadonlyArray<readonly [string, string]> = [];

export type LimitesTurno = { primeira: number; ultima: number };

/** Primeira e ultima aula letiva de cada turno da escola (horario_slots). */
export async function limitesLetivosPorTurno(escolaId: EscolaId): Promise<Map<string, LimitesTurno>> {
  const slots = await db
    .select({ turno: horarioSlotsTable.turno, numeroAula: horarioSlotsTable.numeroAula, letivo: horarioSlotsTable.letivo })
    .from(horarioSlotsTable)
    .where(eq(horarioSlotsTable.escolaId, escolaId));
  const mapa = new Map<string, LimitesTurno>();
  for (const s of slots) {
    if (!s.turno || s.letivo === false) continue;
    const atual = mapa.get(s.turno);
    if (!atual) mapa.set(s.turno, { primeira: s.numeroAula, ultima: s.numeroAula });
    else {
      if (s.numeroAula < atual.primeira) atual.primeira = s.numeroAula;
      if (s.numeroAula > atual.ultima) atual.ultima = s.numeroAula;
    }
  }
  return mapa;
}

export type BloqueioIntervalo = { professorId: number; dia: number; aula: number; motivo: string };

/** Aula oficial de um professor ja no horario REAL (turma integral convertida para manha/tarde). */
export type AulaReal = { professorId: number | null; turno: string; diaSemana: number; numeroAula: number };

/** Calculo da regra sem banco (testado): bloqueios do `turno` a gerar a partir das aulas dos turnos vizinhos. */
export function calcularBloqueiosIntervalo(
  turno: string,
  limites: Map<string, LimitesTurno>,
  aulasVizinhas: AulaReal[],
  pares: ReadonlyArray<readonly [string, string]> = PARES_TURNO,
): BloqueioIntervalo[] {
  const resultado: BloqueioIntervalo[] = [];
  const vistos = new Set<string>();
  for (const [ant, seg] of pares) {
    const lAnt = limites.get(ant);
    const lSeg = limites.get(seg);
    if (!lAnt || !lSeg) continue;

    let turnoVizinho: string;
    let aulaVizinha: number;
    let aulaBloquear: number;
    if (turno === ant) {
      turnoVizinho = seg; aulaVizinha = lSeg.primeira; aulaBloquear = lAnt.ultima;
    } else if (turno === seg) {
      turnoVizinho = ant; aulaVizinha = lAnt.ultima; aulaBloquear = lSeg.primeira;
    } else {
      continue;
    }

    for (const a of aulasVizinhas) {
      if (a.professorId == null || a.turno !== turnoVizinho || a.numeroAula !== aulaVizinha) continue;
      const k = `${a.professorId}|${a.diaSemana}|${aulaBloquear}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      resultado.push({ professorId: a.professorId, dia: a.diaSemana, aula: aulaBloquear, motivo: `intervalo ${ant}->${seg}` });
    }
  }
  return resultado;
}

/**
 * Horarios proibidos pela regra para o turno que vai ser gerado, com base nas
 * aulas OFICIAIS dos turnos vizinhos (mesmo criterio dos bloqueios de outras turmas).
 */
export async function bloqueiosIntervaloEntreTurnos(
  escolaId: EscolaId,
  turno: string,
  professorIds: number[],
): Promise<BloqueioIntervalo[]> {
  if (professorIds.length === 0) return [];
  const vizinhos = new Set<string>();
  for (const [ant, seg] of PARES_TURNO) {
    if (turno === ant) vizinhos.add(seg);
    else if (turno === seg) vizinhos.add(ant);
  }
  if (vizinhos.size === 0) return [];
  const limites = await limitesLetivosPorTurno(escolaId);

  const aulas: AulaReal[] = await db
    .select({ professorId: horariosTable.professorId, turno: turmasTable.turno, diaSemana: horariosTable.diaSemana, numeroAula: horariosTable.numeroAula })
    .from(horariosTable)
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(and(
      eq(horariosTable.escolaId, escolaId),
      inArray(turmasTable.turno, [...vizinhos]),
      eq(turmasTable.fantasma, false),
      inArray(horariosTable.professorId, professorIds),
    ));
  // [INTERVALO-INTEGRAL] (01/11/2026) aula da turma integral que cai no turno vizinho conta, no horario real
  // dela (como ja fazem Conflitos e o recalculo da HA). Antes so as turmas do proprio turno vizinho contavam.
  // Gerar a propria turma integral continua sem esta regra (a numeracao dela nao e a de manha/tarde).
  for (const t of vizinhos) {
    for (const a of await carregarAulasIntegraisNoTurno(escolaId, t, professorIds)) aulas.push({ ...a, turno: t });
  }
  return calcularBloqueiosIntervalo(turno, limites, aulas);
}
