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
import { db, horarioSlotsTable, horariosTable, turmasTable } from "@workspace/db";
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

/** Mapa do integral a partir de uma lista de horario_slots ja carregada (sem ir ao banco). */
export function mapaIntegralDosSlots(slots: SlotTempo[]): MapaIntegral {
  const integral = slots.filter((s) => s.turno === TURNO_INTEGRAL);
  if (!integral.length) return new Map();
  return calcularMapaIntegral(integral, slots.filter((s) => s.turno !== TURNO_INTEGRAL));
}

// [INTEGRAL-NO-MOTOR] (30/10/2026) Ao gerar/melhorar a grade de um turno (CP-SAT), so as aulas das
// turmas DESTE turno entravam como horario ocupado do professor; a turma integral tem turno proprio
// e ficava de fora. No Mario Braga (29/10) a MELHORIA-matutino pos o professor de Biologia numa turma
// da manha na ter 3a aula, a mesma hora da aula dele na 1ME DOC. Agora as aulas da integral que caem
// no turno entram como ocupadas, ja com o numero da aula do turno real.
type AulaDoProfessor = { turmaId: number; professorId: number; diaSemana: number; numeroAula: number };

/** Aulas de turma integral que caem no `turno`, com o numero da aula desse turno. Funcao pura (testada). */
export function aulasIntegraisNoTurno<A extends AulaDoProfessor>(aulas: A[], turmasIntegrais: Set<number>, mapa: MapaIntegral, turno: string): A[] {
  const r: A[] = [];
  for (const a of aulas) {
    if (!turmasIntegrais.has(a.turmaId)) continue;
    const real = mapa.get(a.numeroAula);
    if (real && real.turno === turno) r.push({ ...a, numeroAula: real.numeroAula });
  }
  return r;
}

/** Le do banco as aulas destes professores em turmas integrais que caem no `turno` (horario real). */
export async function carregarAulasIntegraisNoTurno(escolaId: string, turno: string, professorIds: number[]): Promise<AulaDoProfessor[]> {
  if (!professorIds.length || turno === TURNO_INTEGRAL) return [];
  const integrais = (await db.select({ id: turmasTable.id }).from(turmasTable).where(and(
    eq(turmasTable.escolaId, escolaId), eq(turmasTable.turno, TURNO_INTEGRAL), eq(turmasTable.fantasma, false),
  ))).map((t) => t.id);
  if (!integrais.length) return [];
  const mapa = await carregarMapaIntegral(escolaId);
  const aulas = await db.select({
    turmaId: horariosTable.turmaId, professorId: horariosTable.professorId, diaSemana: horariosTable.diaSemana, numeroAula: horariosTable.numeroAula,
  }).from(horariosTable).where(and(
    eq(horariosTable.escolaId, escolaId), inArray(horariosTable.turmaId, integrais), inArray(horariosTable.professorId, professorIds),
  ));
  return aulasIntegraisNoTurno(aulas, new Set(integrais), mapa, turno);
}

const ORDEM_ESPELHO: Record<string, number> = { matutino: 1, vespertino: 2, noturno: 3 };

/** Id (negativo, nunca existe no banco) da turma "espelho" de uma turma integral num turno real. */
export function idEspelho(turmaId: number, turno: string): number {
  return -(turmaId * 10 + (ORDEM_ESPELHO[turno] ?? 9));
}

/**
 * [TURNO-INTEGRAL-PROFESSOR] (26/10/2026) Para tudo que e do PROFESSOR (PDF por professor,
 * ponto, HA): cada aula de turma integral passa a ser a aula REAL equivalente, numa turma
 * "espelho" com o mesmo nome e o turno real (id negativo, ver idEspelho). Assim a Pratica de
 * Formacao do professor na segunda 13:05 aparece na TARDE dele (3a linha = 15:00 do integral
 * vira a 3a da tarde), sem cada tela precisar conhecer o integral. Aula sem equivalente fica
 * como esta. A turma original continua na lista (para quem procura pelo id dela).
 */
export function projetarIntegral<
  T extends { id: number; turno: string; nivelEnsino?: string | null },
  A extends { turmaId: number; numeroAula: number },
>(turmas: T[], aulas: A[], mapa: MapaIntegral): { turmas: T[]; aulas: A[] } {
  const integrais = new Map(turmas.filter((t) => t.turno === TURNO_INTEGRAL).map((t) => [t.id, t]));
  if (!integrais.size || !mapa.size) return { turmas, aulas };
  const espelhos = new Map<number, T>();
  const novas = aulas.map((a) => {
    const t = integrais.get(a.turmaId);
    const real = t ? mapa.get(a.numeroAula) : undefined;
    if (!t || !real) return a;
    const id = idEspelho(t.id, real.turno);
    if (!espelhos.has(id)) {
      const nivelEnsino = real.turno === "matutino" ? (t.nivelEnsino ?? "medio_tecnico") : (t.nivelEnsino ?? null);
      espelhos.set(id, { ...t, id, turno: real.turno, nivelEnsino } as T);
    }
    return { ...a, turmaId: id, numeroAula: real.numeroAula };
  });
  return { turmas: [...turmas, ...espelhos.values()], aulas: novas };
}
