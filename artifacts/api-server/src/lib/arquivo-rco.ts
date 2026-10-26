// [ARQUIVO-RCO] (26/10/2026) Arquivo de exportacao da Grade de Horario do RCO enviado pela escola.
// A Nexus Core pede (Painel Master) e a escola envia pela tela "Arquivo do RCO". Guardado em
// `configuracoes` (sem tabela nova, sem migracao):
//   arquivo_rco_solicitado -> { em, por, mensagem }            (pedido em aberto)
//   arquivo_rco_exportacao -> { nomeArquivo, enviadoEm, enviadoPor, resumo }   (ultimo envio, sem o conteudo)
//   arquivo_rco_conteudo   -> { xml }                           (conteudo do ultimo envio; fora das listas)
import { db, configuracoesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { ResumoExportacaoRco } from "./rco-exportacao";

export const CHAVE_SOLICITADO = "arquivo_rco_solicitado";
export const CHAVE_EXPORTACAO = "arquivo_rco_exportacao";
export const CHAVE_CONTEUDO = "arquivo_rco_conteudo";
/** Chaves que a escola nao grava pela rota generica de configuracoes nem ve na lista. */
export const CHAVES_ARQUIVO_RCO = new Set([CHAVE_SOLICITADO, CHAVE_EXPORTACAO, CHAVE_CONTEUDO]);

export type PedidoArquivoRco = { em: string; por: string | null; mensagem: string | null };
export type EnvioArquivoRco = { nomeArquivo: string; enviadoEm: string; enviadoPor: string | null; resumo: ResumoExportacaoRco; tamanho: number };
export type SituacaoArquivoRco = { solicitado: PedidoArquivoRco | null; enviado: EnvioArquivoRco | null };

async function ler<T>(escolaId: string, chave: string): Promise<T | null> {
  const [r] = await db.select({ valor: configuracoesTable.valor }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, chave)));
  return (r?.valor as T | undefined) ?? null;
}
async function gravar(escolaId: string, chave: string, valor: unknown, descricao: string): Promise<void> {
  const existe = await db.select({ id: configuracoesTable.id }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, chave)));
  if (existe.length) {
    await db.update(configuracoesTable).set({ valor, descricao })
      .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, chave)));
  } else {
    await db.insert(configuracoesTable).values({ escolaId, chave, valor, descricao });
  }
}
async function apagar(escolaId: string, chave: string): Promise<void> {
  await db.delete(configuracoesTable).where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, chave)));
}

export async function situacaoArquivoRco(escolaId: string): Promise<SituacaoArquivoRco> {
  const [solicitado, enviado] = await Promise.all([
    ler<PedidoArquivoRco>(escolaId, CHAVE_SOLICITADO),
    ler<EnvioArquivoRco>(escolaId, CHAVE_EXPORTACAO),
  ]);
  return { solicitado, enviado };
}

/** Situacao de varias escolas (Painel Master), sem o conteudo dos arquivos. */
export async function situacaoArquivoRcoEscolas(): Promise<Record<string, SituacaoArquivoRco>> {
  const rows = await db.select({ escolaId: configuracoesTable.escolaId, chave: configuracoesTable.chave, valor: configuracoesTable.valor })
    .from(configuracoesTable).where(inArray(configuracoesTable.chave, [CHAVE_SOLICITADO, CHAVE_EXPORTACAO]));
  const out: Record<string, SituacaoArquivoRco> = {};
  for (const r of rows) {
    const s = (out[r.escolaId] ??= { solicitado: null, enviado: null });
    if (r.chave === CHAVE_SOLICITADO) s.solicitado = r.valor as PedidoArquivoRco;
    else s.enviado = r.valor as EnvioArquivoRco;
  }
  return out;
}

export async function solicitarArquivoRco(escolaId: string, por: string | null, mensagem: string | null): Promise<void> {
  await gravar(escolaId, CHAVE_SOLICITADO, { em: new Date().toISOString(), por, mensagem } satisfies PedidoArquivoRco,
    "Pedido da Nexus Core: enviar o arquivo de exportacao da Grade de Horario do RCO");
}
export async function cancelarPedidoArquivoRco(escolaId: string): Promise<void> {
  await apagar(escolaId, CHAVE_SOLICITADO);
}

/** Grava o envio (substitui o anterior) e encerra o pedido em aberto. */
export async function guardarArquivoRco(escolaId: string, envio: EnvioArquivoRco, xml: string): Promise<void> {
  await gravar(escolaId, CHAVE_CONTEUDO, { xml }, "Conteudo do arquivo de exportacao do RCO (ultimo envio)");
  await gravar(escolaId, CHAVE_EXPORTACAO, envio, "Ultimo arquivo de exportacao do RCO enviado pela escola");
  await apagar(escolaId, CHAVE_SOLICITADO);
}

export async function conteudoArquivoRco(escolaId: string): Promise<{ xml: string; nomeArquivo: string } | null> {
  const [c, e] = await Promise.all([ler<{ xml: string }>(escolaId, CHAVE_CONTEUDO), ler<EnvioArquivoRco>(escolaId, CHAVE_EXPORTACAO)]);
  return c?.xml ? { xml: c.xml, nomeArquivo: e?.nomeArquivo ?? "exportacao-rco.xml" } : null;
}
