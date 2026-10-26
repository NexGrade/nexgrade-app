// [TURNO-INTEGRAL] (26/10/2026) Turma de periodo integral (ex.: 1ME DOC, Formacao de
// Docentes do Mario Braga): manha + tarde no mesmo dia. No RCO e um turno proprio
// ("Integral"), com os seus 11 horarios (07:30 ... 16:40), que nao batem 100% com os
// do Vespertino (a 3a da tarde do integral e 15:00; a do Vespertino, 14:45).
//
// Por isso o integral tem esquema proprio em horario_slots (turno = "integral"), e
// cada aula dele e ligada ao horario REAL do Matutino/Vespertino/Noturno que ocupa o
// mesmo tempo (maior sobreposicao). Tudo que e do PROFESSOR (choque entre turmas,
// disponibilidade, HA, teto de aulas por turno) usa esse horario real -- assim o
// professor da 1ME nao pode estar ao mesmo tempo numa turma da manha ou da tarde, e a
// disponibilidade dele continua sendo a do Matutino/Vespertino, sem cadastro novo.
import { db, horarioSlotsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export const TURNO_INTEGRAL = "integral";

export type SlotReal = { turno: string; numeroAula: number };
export type MapaIntegral = Map<number, SlotReal>;

type SlotTempo = { turno: string; nivelEnsino?: string | null; numeroAula: number; horaInicio: string; duracaoMinutos: number; letivo?: boolean | null };

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Liga cada aula do integral ao horario real (turno + numero da aula) que mais se
 * sobrepoe a ela no tempo. Funcao pura (testada). No matutino usa o esquema do
 * Medio/Tecnico quando existe (o integral e de ensino medio); os dois esquemas do
 * matutino tem a mesma numeracao nos mesmos horarios. Aula sem sobreposicao nenhuma
 * fica sem equivalente (nao choca com nada).
 */
export function calcularMapaIntegral(slotsIntegral: SlotTempo[], slotsOutros: SlotTempo[]): MapaIntegral {
  const candidatos: SlotTempo[] = [];
  for (const turno of ["matutino", "vespertino", "noturno"]) {
    const doTurno = slotsOutros.filter((s) => s.turno === turno && s.numeroAula >= 1 && s.letivo !== false);
    const preferidos = turno === "matutino"
      ? (doTurno.some((s) => s.nivelEnsino === "medio_tecnico")
        ? doTurno.filter((s) => s.nivelEnsino === "medio_tecnico")
        : doTurno.filter((s) => s.nivelEnsino === "fundamental").length
          ? doTurno.filter((s) => s.nivelEnsino === "fundamental")
          : doTurno)
      : doTurno;
    candidatos.push(...preferidos);
  }
  const mapa: MapaIntegral = new Map();
  for (const i of slotsIntegral) {
    if (i.numeroAula < 1) continue;
    const ini = minutos(i.horaInicio);
    const fim = ini + i.duracaoMinutos;
    let melhor: SlotTempo | null = null;
    let melhorSobreposicao = 0;
    for (const c of candidatos) {
      const cIni = minutos(c.horaInicio);
      const cFim = cIni + c.duracaoMinutos;
      const sobreposicao = Math.min(fim, cFim) - Math.max(ini, cIni);
      if (sobreposicao > melhorSobreposicao) {
        melhorSobreposicao = sobreposicao;
        melhor = c;
      }
    }
    if (melhor) mapa.set(i.numeroAula, { turno: melhor.turno, numeroAula: melhor.numeroAula });
  }
  return mapa;
}

/** Le o esquema do integral e dos outros turnos da escola e monta o mapa. */
export async function carregarMapaIntegral(escolaId: string): Promise<MapaIntegral> {
  const slots = await db.select().from(horarioSlotsTable).where(and(
    eq(horarioSlotsTable.escolaId, escolaId),
    inArray(horarioSlotsTable.turno, [TURNO_INTEGRAL, "matutino", "vespertino", "noturno"]),
  ));
  const integral = slots.filter((s) => s.turno === TURNO_INTEGRAL);
  if (!integral.length) return new Map();
  return calcularMapaIntegral(integral, slots.filter((s) => s.turno !== TURNO_INTEGRAL));
}

/**
 * Horario real de uma aula: para turma comum, o proprio turno e aula; para turma
 * integral, o equivalente no Matutino/Vespertino. Sem equivalente, fica no proprio
 * "integral" (so choca com outra aula integral no mesmo numero).
 */
export function slotReal(turnoDaTurma: string, numeroAula: number, mapa: MapaIntegral): SlotReal {
  if (turnoDaTurma !== TURNO_INTEGRAL) return { turno: turnoDaTurma, numeroAula };
  return mapa.get(numeroAula) ?? { turno: TURNO_INTEGRAL, numeroAula };
}
