// [HA-INCOMPLETA-REFAZ] (04/11/2026) Na promocao (e na simulacao, que imita a promocao), quem nao teve aula mexida
// fica com a HA de hoje ([HA-SO-QUEM-MUDOU]). Se a HA de hoje estiver INCOMPLETA (menos HA no turno do que a regra),
// o professor ficava assim para sempre. Caso real: Alexandre Moreira (Demonstracao, 04/11), 10 aulas so de manha e
// nenhuma HA.
// [HA-SO-COMPLETAR] (04/11/2026, decisao da dona) "nao precisa mudar, so completar se faltar": a HA de hoje NAO muda
// (nem de lugar nem a mais do que a regra); quem tem MENOS HA do que a regra num turno ganha so as que faltam, nos
// horarios livres que deixam menos janela (completarHA). HA a mais fica como esta.
import { calcularHAIdeal, type AulaParaCalculoHA, type MarcaHACalculada } from "./recalcular-ha";

export interface MarcaTurno { professorId: number; turno: string | null }
export interface LinhaHA { professorId: number; turno: string | null; horaAtividadeObrigatoria: boolean }

/** Professores com MENOS HA do que a regra em algum dos turnos (HA a mais nao conta). */
export function professoresComHAIncompleta(haIdeal: MarcaTurno[], haHoje: LinhaHA[], turnos: string[]): Set<number> {
  const alvo = new Set(turnos);
  const contar = (rows: MarcaTurno[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.turno && alvo.has(r.turno)) m.set(`${r.professorId}|${r.turno}`, (m.get(`${r.professorId}|${r.turno}`) ?? 0) + 1);
    return m;
  };
  const ideal = contar(haIdeal);
  const hoje = contar(haHoje.filter((d) => d.horaAtividadeObrigatoria));
  const r = new Set<number>();
  for (const [k, n] of ideal) if ((hoje.get(k) ?? 0) < n) r.add(Number(k.split("|")[0]));
  return r;
}

/**
 * [HA-SO-COMPLETAR] HA que falta para os professores indicados: a HA de hoje deles fica toda no lugar (preservada no
 * recalculo) e o recalculo so completa ate a regra. Devolve so as marcas NOVAS (as que nao existem hoje).
 */
export async function completarHA(
  escolaId: string,
  professores: Set<number>,
  haHoje: Array<{ professorId: number; turno: string | null; diaSemana: number; horarioSlot: number; horaAtividadeObrigatoria?: boolean }>,
  aulas?: AulaParaCalculoHA[],
): Promise<MarcaHACalculada[]> {
  if (!professores.size) return [];
  const ideal = await calcularHAIdeal(escolaId, aulas, { preservarHAde: professores });
  const existe = new Set(haHoje.filter((d) => d.horaAtividadeObrigatoria !== false).map((d) => `${d.professorId}|${d.turno ?? "sem_turno"}|${d.diaSemana}|${d.horarioSlot}`));
  return ideal.filter((m) => professores.has(m.professorId) && !existe.has(`${m.professorId}|${m.turno}|${m.diaSemana}|${m.horarioSlot}`));
}

/** [HA-SO-COMPLETAR] grava as HA novas (completadas). So ocupa horario livre: nunca passa por cima de bloqueio ou atividade. */
export async function gravarHACompletada(marcas: MarcaHACalculada[]): Promise<number> {
  if (!marcas.length) return 0;
  const { db, disponibilidadeTable } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  const { MOTIVO_HA_AUTO, MOTIVO_HA_AUTO_OUTRO_TURNO } = await import("./ha-contraturno");
  const rows = await db.insert(disponibilidadeTable).values(marcas.map((m) => ({
    professorId: m.professorId,
    turno: m.turno === "sem_turno" ? null : m.turno,
    diaSemana: m.diaSemana,
    horarioSlot: m.horarioSlot,
    disponivel: true,
    horaAtividadeObrigatoria: true,
    motivo: m.outroTurno ? MOTIVO_HA_AUTO_OUTRO_TURNO : MOTIVO_HA_AUTO,
  }))).onConflictDoUpdate({
    target: [disponibilidadeTable.professorId, disponibilidadeTable.diaSemana, disponibilidadeTable.horarioSlot, disponibilidadeTable.turno],
    set: { disponivel: true, horaAtividadeObrigatoria: true, motivo: sql`excluded.motivo` },
    where: sql`${disponibilidadeTable.disponivel} = true AND ${disponibilidadeTable.horaAtividadeObrigatoria} = false AND COALESCE(${disponibilidadeTable.motivo}, '') NOT LIKE '%ocupado:%'`,
  }).returning({ id: disponibilidadeTable.id });
  return rows.length;
}
