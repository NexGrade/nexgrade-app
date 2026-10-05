// [REVEZAMENTO-TRIO] (05/10/2026) Revezamento semanal da docencia por trio:
// semana 1 a disciplina de ordem 1 fica presencial, semana 2 a de ordem 2,
// semana 3 a de ordem 3, e repete. Conta semanas corridas do calendario
// (feriado nao muda a ordem). Os outros dois professores ficam em suporte.
import { db, turmaDisciplinasTable } from "@workspace/db";
import { and, inArray, isNotNull } from "drizzle-orm";

const DIA_MS = 86_400_000;

/** Segunda-feira (UTC, 00:00) da semana da data. */
export function segundaDaSemana(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/** Data "de hoje" no horario de Brasilia, deslocada em N semanas. */
export function hojeBrasil(offsetSemanas = 0): Date {
  return new Date(Date.now() - 3 * 3_600_000 + offsetSemanas * 7 * DIA_MS);
}

/** Qual ordem (1, 2 ou 3) esta presencial na semana da data. */
export function ordemPresencial(inicio: string, data: Date): number {
  const a = segundaDaSemana(new Date(`${inicio}T12:00:00Z`)).getTime();
  const b = segundaDaSemana(data).getTime();
  const semanas = Math.round((b - a) / (7 * DIA_MS));
  return (((semanas % 3) + 3) % 3) + 1;
}

export type SituacaoTrio = { presencial: boolean; trio: string };

/**
 * Situacao de cada linha de trio com revezamento configurado, na semana da data.
 * Chave: `${turmaId}|${disciplinaId}|${professorId}`. Trio sem ordem/inicio fica de fora.
 */
export async function mapaRevezamento(turmaIds: number[], data: Date): Promise<Map<string, SituacaoTrio>> {
  const mapa = new Map<string, SituacaoTrio>();
  if (turmaIds.length === 0) return mapa;
  const linhas = await db.select().from(turmaDisciplinasTable).where(and(
    inArray(turmaDisciplinasTable.turmaId, turmaIds),
    isNotNull(turmaDisciplinasTable.grupoTrio),
    isNotNull(turmaDisciplinasTable.trioOrdem),
    isNotNull(turmaDisciplinasTable.trioInicio),
  ));
  for (const l of linhas) {
    if (!l.professorId || !l.trioInicio || !l.trioOrdem || !(l.grupoTrio ?? "").trim()) continue;
    mapa.set(`${l.turmaId}|${l.disciplinaId}|${l.professorId}`, {
      presencial: l.trioOrdem === ordemPresencial(l.trioInicio, data),
      trio: (l.grupoTrio ?? "").trim(),
    });
  }
  return mapa;
}
