// [LIMITE-DISCIPLINA] (01/11/2026) Máximo de aulas por dia de uma disciplina para a escola toda
// (ex.: Educação Física 1 por dia). Guardado em `configuracoes` (chave abaixo, valor {disciplinaId: n}),
// sem migração. Ordem usada pelo gerador e pelos conflitos: limite da turma+disciplina
// (turma_disciplinas.max_aulas_consecutivas_dia) > limite da disciplina na escola > padrão da rede (3).
import { and, eq } from "drizzle-orm";
import { db, configuracoesTable } from "@workspace/db";

export const CHAVE_LIMITE_DISCIPLINA = "escola.max_aulas_dia_por_disciplina";
export const LIMITE_MIN = 1;
export const LIMITE_MAX = 6;

/** Lê o valor gravado; ignora o que não for número inteiro entre 1 e 6. */
export function lerLimites(valor: unknown): Map<number, number> {
  const mapa = new Map<number, number>();
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return mapa;
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    const id = Number(k);
    if (Number.isInteger(id) && id > 0 && typeof v === "number" && Number.isInteger(v) && v >= LIMITE_MIN && v <= LIMITE_MAX) {
      mapa.set(id, v);
    }
  }
  return mapa;
}

export async function carregarLimitesPorDisciplina(escolaId: string): Promise<Map<number, number>> {
  const [linha] = await db.select({ valor: configuracoesTable.valor }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_LIMITE_DISCIPLINA)));
  return lerLimites(linha?.valor);
}

export function limiteAulasDia(
  td: { disciplinaId: number; maxAulasConsecutivasDia: number | null | undefined },
  porDisciplina: Map<number, number>,
  padrao: number,
): number {
  return td.maxAulasConsecutivasDia ?? porDisciplina.get(td.disciplinaId) ?? padrao;
}
