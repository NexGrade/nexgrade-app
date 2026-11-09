// [MODO-RASCUNHO] (06/11/2026) Pedido da dona: o experimento virou "rascunho" — um por escola, visivel para toda a
// direcao. Com o rascunho ligado (cada pessoa liga no proprio navegador), as telas de sempre (Grade, Disponibilidade,
// Turmas) leem e gravam nele; "Aplicar na escola" e o Promover do experimento. Por baixo o rascunho e um experimento
// comum (horarios_experimentais, disponibilidade_experimental, atribuicao_experimental); aqui so fica qual e o
// rascunho da escola, guardado em configuracoes (chave "rascunho.ativo"), sem migracao.
import { and, eq } from "drizzle-orm";
import { db, configuracoesTable } from "@workspace/db";

const CHAVE = "rascunho.ativo";
// [RASCUNHO-ALCANCE] (09/11/2026) alcance: "todos", um turno ou "turmas" (turmaIds). Rascunhos antigos nao tem: a escola toda.
export type RascunhoAtivo = { nome: string; criadoEm: string; criadoPor: string | null; alcance?: string; turmaIds?: number[] };

export async function lerRascunho(escolaId: string): Promise<RascunhoAtivo | null> {
  const [r] = await db.select({ valor: configuracoesTable.valor }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE)));
  const v = r?.valor as RascunhoAtivo | null | undefined;
  return v && typeof v.nome === "string" && v.nome ? v : null;
}

export async function gravarRascunho(escolaId: string, v: RascunhoAtivo): Promise<void> {
  await limparRascunho(escolaId);
  await db.insert(configuracoesTable).values({ escolaId, chave: CHAVE, valor: v, descricao: "Rascunho da grade em edição (Modo rascunho)" });
}

export async function limparRascunho(escolaId: string, soSeFor?: string): Promise<void> {
  if (soSeFor) {
    const atual = await lerRascunho(escolaId);
    if (atual?.nome !== soSeFor) return;
  }
  await db.delete(configuracoesTable).where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE)));
}
