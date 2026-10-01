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
  const limites = await limitesLetivosPorTurno(escolaId);
  const resultado: BloqueioIntervalo[] = [];
  const vistos = new Set<string>();

  for (const [ant, seg] of PARES_TURNO) {
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

    const ocupados = await db
      .select({ professorId: horariosTable.professorId, dia: horariosTable.diaSemana })
      .from(horariosTable)
      .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
      .where(and(
        eq(horariosTable.escolaId, escolaId),
        eq(turmasTable.turno, turnoVizinho),
        eq(turmasTable.fantasma, false),
        eq(horariosTable.numeroAula, aulaVizinha),
        inArray(horariosTable.professorId, professorIds),
      ));

    for (const o of ocupados) {
      if (o.professorId == null) continue;
      const k = `${o.professorId}|${o.dia}|${aulaBloquear}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      resultado.push({ professorId: o.professorId, dia: o.dia, aula: aulaBloquear, motivo: `intervalo ${ant}->${seg}` });
    }
  }
  return resultado;
}
