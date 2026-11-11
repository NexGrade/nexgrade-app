// [DISP-EXPERIMENTAL] (06/11/2026) Disponibilidade dentro de um experimento (tabela disponibilidade_experimental).
//
// Como funciona: as rotas de um experimento (gerar, melhorar, simular promocao, fechar janela, PDF da previa)
// passam pelo middleware abaixo, que carrega as mudancas daquele experimento e as deixa no contexto da
// requisicao (AsyncLocalStorage, que acompanha tambem o job do motor que continua depois da resposta).
// Cada leitura da disponibilidade usada nesses caminhos passa por `sobreporExperimento`: fora de um
// experimento devolve as linhas como vieram; dentro, a linha do experimento vale no lugar da oficial de
// mesma chave (professor, dia, aula, turno). Nada disso grava na disponibilidade oficial: so o Promover.
//
// Sem a migracao 0008 a tabela nao existe: as mudancas voltam vazias (tudo segue como antes) e so a edicao
// da disponibilidade de um experimento avisa (503).
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, disponibilidadeTable, disponibilidadeExperimentalTable, atribuicaoExperimentalTable, experimentosTable, turmaDisciplinasTable,
  type DisponibilidadeExperimental,
} from "@workspace/db";
import { getEscolaId } from "./escola-id";

export type LinhaDisp = typeof disponibilidadeTable.$inferSelect;
// [EXPERIMENTO-COMPLETO] (06/11/2026) o contexto leva tambem a atribuicao do experimento (turmaDisciplinaId -> professor)
type Contexto = { escolaId: string; nome: string; linhas: LinhaDisp[]; atribuicoes: Map<number, number | null> };
const contexto = new AsyncLocalStorage<Contexto>();

type ChaveDisp = { professorId: number; diaSemana: number; horarioSlot: number; turno: string | null };
export const chaveDisp = (r: ChaveDisp) => `${r.professorId}|${r.diaSemana}|${r.horarioSlot}|${r.turno ?? ""}`;

/** Tabela ainda nao criada (migracao 0008 atrasada). */
export function semTabelaExperimental(e: unknown): boolean {
  const c = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return c === "42P01";
}

/** Linha do experimento no formato da disponibilidade oficial (id negativo: nao existe na tabela oficial). */
export function comoLinhaDisp(m: DisponibilidadeExperimental): LinhaDisp {
  return {
    id: -m.id, professorId: m.professorId, diaSemana: m.diaSemana, horarioSlot: m.horarioSlot, turno: m.turno,
    disponivel: m.disponivel, motivo: m.motivo, horaAtividadeObrigatoria: m.horaAtividadeObrigatoria, createdAt: m.atualizadoEm,
  };
}

export async function carregarMudancas(escolaId: string, nome: string): Promise<{ linhas: DisponibilidadeExperimental[]; semTabela: boolean }> {
  try {
    const linhas = await db.select().from(disponibilidadeExperimentalTable)
      .where(and(eq(disponibilidadeExperimentalTable.escolaId, escolaId), eq(disponibilidadeExperimentalTable.nome, nome)));
    return { linhas, semTabela: false };
  } catch (e) {
    if (semTabelaExperimental(e)) return { linhas: [], semTabela: true };
    throw e;
  }
}

/** Junta: a linha do experimento substitui a oficial de mesma chave. `filtro` = o mesmo filtro da consulta
 *  oficial (as linhas do experimento entram so se passarem nele). Funcao pura, testada. */
export function sobrepor<T extends ChaveDisp>(oficial: T[], mudancas: LinhaDisp[], filtro?: (r: LinhaDisp) => boolean): T[] {
  if (!mudancas.length) return oficial;
  const chaves = new Set(mudancas.map(chaveDisp));
  return [...oficial.filter((r) => !chaves.has(chaveDisp(r))), ...(mudancas.filter((r) => !filtro || filtro(r)) as unknown as T[])];
}

/** Disponibilidade com as mudancas do experimento da requisicao (se houver). */
export function sobreporExperimento<T extends ChaveDisp>(oficial: T[], filtro?: (r: LinhaDisp) => boolean): T[] {
  const ctx = contexto.getStore();
  return ctx ? sobrepor(oficial, ctx.linhas, filtro) : oficial;
}

/** [EXPERIMENTO-COMPLETO] atribuicao do experimento: troca o professor das linhas de turma_disciplinas. */
export function sobreporAtribuicao<T extends { id: number; professorId: number | null }>(rows: T[]): T[] {
  const ctx = contexto.getStore();
  if (!ctx || !ctx.atribuicoes.size) return rows;
  return rows.map((r) => (ctx.atribuicoes.has(r.id) ? { ...r, professorId: ctx.atribuicoes.get(r.id)! } : r));
}

export async function carregarAtribuicoes(escolaId: string, nome: string): Promise<Map<number, number | null>> {
  try {
    const r = await db.select().from(atribuicaoExperimentalTable)
      .where(and(eq(atribuicaoExperimentalTable.escolaId, escolaId), eq(atribuicaoExperimentalTable.nome, nome)));
    return new Map(r.map((x) => [x.turmaDisciplinaId, x.professorId ?? null]));
  } catch (e) {
    if (semTabelaExperimental(e)) return new Map();
    throw e;
  }
}

async function montarContexto(escolaId: string, nome: string): Promise<Contexto | null> {
  const [{ linhas }, atribuicoes] = await Promise.all([carregarMudancas(escolaId, nome), carregarAtribuicoes(escolaId, nome)]);
  if (!linhas.length && !atribuicoes.size) return null;
  return { escolaId, nome, linhas: linhas.map(comoLinhaDisp), atribuicoes };
}

/** Nome do experimento do contexto atual (para logs e testes). */
export const experimentoDoContexto = () => contexto.getStore()?.nome ?? null;

/** Roda `fn` com as mudancas do experimento no contexto (usado pelo middleware e pelos testes). */
export async function comExperimento<T>(escolaId: string, nome: string, fn: () => Promise<T>): Promise<T> {
  const ctx = await montarContexto(escolaId, nome);
  return ctx ? contexto.run(ctx, fn) : fn();
}

const ROTA_DO_EXPERIMENTO = /^\/experimentais\/([^/]+)\/(simulacao|fechar-janela|trocar|trocar-aulas|resolver-choques)\/?$/; // [RESOLVER-CHOQUE]

/** Nome do experimento que a requisicao usa: nomeExperimental no corpo ou na URL, ou /experimentais/:nome/... */
export function nomeDaRequisicao(req: Pick<Request, "body" | "query" | "path">): string | null {
  const corpo = (req.body ?? {}) as { nomeExperimental?: unknown; experimental?: unknown };
  if (typeof corpo.nomeExperimental === "string" && corpo.nomeExperimental.trim() && corpo.experimental !== false) return corpo.nomeExperimental;
  const q = req.query?.nomeExperimental;
  if (typeof q === "string" && q.trim()) return q;
  const m = ROTA_DO_EXPERIMENTO.exec(req.path ?? "");
  if (m) { try { return decodeURIComponent(m[1]!); } catch { return m[1]!; } }
  return null;
}

export function middlewareDisponibilidadeExperimental(req: Request, _res: Response, next: NextFunction) {
  const nome = nomeDaRequisicao(req);
  if (!nome) { next(); return; }
  let escolaId: string;
  try { escolaId = getEscolaId(req); } catch { next(); return; }
  montarContexto(escolaId, nome).then((ctx) => {
    if (!ctx) { next(); return; }
    contexto.run(ctx, () => next());
  }, next);
}

// ---------------------------------------------------------------------------------------------------------
// Promover: aplica as mudancas na disponibilidade oficial (e devolve o que havia antes, para a copia de
// seguranca e para desfazer se a promocao falhar).

/** Linhas oficiais de hoje nas chaves que o experimento muda (null = nao havia linha). */
export async function oficialNasChaves(mudancas: DisponibilidadeExperimental[]): Promise<LinhaDisp[]> {
  if (!mudancas.length) return [];
  const profIds = [...new Set(mudancas.map((m) => m.professorId))];
  const chaves = new Set(mudancas.map(chaveDisp));
  const rows = await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds));
  return rows.filter((r) => chaves.has(chaveDisp(r)));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function apagarChaves(tx: Tx, chaves: ChaveDisp[]) {
  for (let i = 0; i < chaves.length; i += 500) {
    const lote = chaves.slice(i, i + 500);
    await tx.delete(disponibilidadeTable).where(sql`(${disponibilidadeTable.professorId}, ${disponibilidadeTable.diaSemana}, ${disponibilidadeTable.horarioSlot}, COALESCE(${disponibilidadeTable.turno}, '')) IN (${sql.join(
      lote.map((x) => sql`(${x.professorId}, ${x.diaSemana}, ${x.horarioSlot}, ${x.turno ?? ""})`), sql`, `)})`);
  }
}

/** Grava as mudancas do experimento na disponibilidade oficial (troca a linha de mesma chave). */
export async function aplicarMudancasNaOficial(mudancas: DisponibilidadeExperimental[]): Promise<void> {
  if (!mudancas.length) return;
  await db.transaction(async (tx) => {
    await apagarChaves(tx, mudancas);
    const linhas = mudancas.map((m) => ({
      professorId: m.professorId, diaSemana: m.diaSemana, horarioSlot: m.horarioSlot, turno: m.turno,
      disponivel: m.disponivel, motivo: m.motivo, horaAtividadeObrigatoria: m.horaAtividadeObrigatoria,
    }));
    for (let i = 0; i < linhas.length; i += 500) await tx.insert(disponibilidadeTable).values(linhas.slice(i, i + 500));
  });
}

export type DispAntes = { chaves: ChaveDisp[]; antes: Array<Omit<LinhaDisp, "id" | "createdAt">> };

/** Volta as chaves ao que eram (desfaz aplicarMudancasNaOficial; usado tambem ao restaurar a copia). */
export async function voltarChaves(tx: Tx, d: DispAntes, profIdsValidos?: Set<number>): Promise<void> {
  const chaves = profIdsValidos ? d.chaves.filter((c) => profIdsValidos.has(c.professorId)) : d.chaves;
  if (!chaves.length) return;
  await apagarChaves(tx, chaves);
  const antes = d.antes.filter((r) => !profIdsValidos || profIdsValidos.has(r.professorId));
  for (let i = 0; i < antes.length; i += 500) await tx.insert(disponibilidadeTable).values(antes.slice(i, i + 500));
}

export const paraDispAntes = (mudancas: DisponibilidadeExperimental[], antes: LinhaDisp[]): DispAntes => ({
  chaves: mudancas.map((m) => ({ professorId: m.professorId, diaSemana: m.diaSemana, horarioSlot: m.horarioSlot, turno: m.turno })),
  antes: antes.map(({ id: _id, createdAt: _c, ...r }) => r),
});

export async function apagarMudancas(escolaId: string, nome: string): Promise<number> {
  try {
    const r = await db.delete(disponibilidadeExperimentalTable)
      .where(and(eq(disponibilidadeExperimentalTable.escolaId, escolaId), eq(disponibilidadeExperimentalTable.nome, nome)))
      .returning({ id: disponibilidadeExperimentalTable.id });
    return r.length;
  } catch (e) {
    if (semTabelaExperimental(e)) return 0;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------
// [EXPERIMENTO-COMPLETO] registro do experimento e atribuicao ao promover

/** Garante o registro do experimento (ele existe mesmo sem aula gerada). Sem a migracao 0009, nao faz nada. */
export async function registrarExperimento(escolaId: string, nome: string, criadoPor?: string | null): Promise<void> {
  try {
    await db.insert(experimentosTable).values({ escolaId, nome, criadoPor: criadoPor ?? null }).onConflictDoNothing();
  } catch (e) {
    if (!semTabelaExperimental(e)) throw e;
  }
}

export type AtribuicaoAntes = Array<{ turmaDisciplinaId: number; professorId: number | null }>;

/** Grava a atribuicao do experimento em turma_disciplinas; devolve como estava (para a copia e para desfazer). */
export async function aplicarAtribuicoesNaOficial(atribuicoes: Map<number, number | null>): Promise<AtribuicaoAntes> {
  if (!atribuicoes.size) return [];
  const ids = [...atribuicoes.keys()];
  const antes = (await db.select({ id: turmaDisciplinasTable.id, professorId: turmaDisciplinasTable.professorId })
    .from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.id, ids)))
    .map((r) => ({ turmaDisciplinaId: r.id, professorId: r.professorId ?? null }));
  await db.transaction(async (tx) => {
    for (const [id, professorId] of atribuicoes) await tx.update(turmaDisciplinasTable).set({ professorId }).where(eq(turmaDisciplinasTable.id, id));
  });
  return antes;
}

export async function voltarAtribuicoes(tx: Tx, antes: AtribuicaoAntes): Promise<void> {
  for (const a of antes) await tx.update(turmaDisciplinasTable).set({ professorId: a.professorId }).where(eq(turmaDisciplinasTable.id, a.turmaDisciplinaId));
}

/** Apaga tudo o que o experimento guarda alem das aulas (disponibilidade, atribuicao e o registro). */
export async function apagarExtrasDoExperimento(escolaId: string, nome: string): Promise<number> {
  let n = await apagarMudancas(escolaId, nome);
  try {
    n += (await db.delete(atribuicaoExperimentalTable)
      .where(and(eq(atribuicaoExperimentalTable.escolaId, escolaId), eq(atribuicaoExperimentalTable.nome, nome)))
      .returning({ id: atribuicaoExperimentalTable.id })).length;
    n += (await db.delete(experimentosTable)
      .where(and(eq(experimentosTable.escolaId, escolaId), eq(experimentosTable.nome, nome)))
      .returning({ id: experimentosTable.id })).length;
  } catch (e) {
    if (!semTabelaExperimental(e)) throw e;
  }
  return n;
}
