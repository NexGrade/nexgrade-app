/**
 * [TRAVA-AVALIACAO] (01/11/2026) Escola nova tem 30 dias de cortesia (escolas.trial_ends_at).
 * Depois disso, sem assinatura ativa e sem isencao, o sistema fica bloqueado para todos da
 * escola (equipe e professores) ate a Nexus Core efetivar a assinatura ou marcar a escola como
 * isenta. "Escola ativa" desligado no Painel Master (plano_ativo = false) tambem bloqueia.
 * Nada e apagado: ao liberar, tudo volta como estava. A Nexus Core (Master) nunca e bloqueada.
 */
import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, escolasTable } from "@workspace/db";
import { getEscolaId } from "./escola-id";
import { isMaster } from "../middlewares/requireMaster";
import { normalizarCaminho } from "./permissao";

export const DIAS_AVISO_AVALIACAO = 7;
const DIA_MS = 86_400_000;

export type MotivoBloqueio = "avaliacao_encerrada" | "suspensa";
export type SituacaoAcesso = {
  bloqueada: boolean;
  motivo: MotivoBloqueio | null;
  /** fim da avaliacao (ISO), quando a escola esta ou esteve em avaliacao sem assinatura */
  avaliacaoAte: string | null;
  /** dias que faltam da avaliacao; so nos ultimos DIAS_AVISO_AVALIACAO dias (para o aviso) */
  diasRestantes: number | null;
};

type DadosEscola = {
  isenta: boolean;
  planoAtivo: boolean;
  trialEndsAt: Date | string | null;
  asaasSubscriptionId: string | null;
  asaasStatusAssinatura: string | null;
};

const LIBERADA: SituacaoAcesso = { bloqueada: false, motivo: null, avaliacaoAte: null, diasRestantes: null };

/** Regra da trava (pura, testada em __tests__/situacao-escola.test.ts). */
export function situacaoDaEscola(e: DadosEscola | null | undefined, agora: Date = new Date()): SituacaoAcesso {
  if (!e || e.isenta) return LIBERADA; // sem escola (cadastro) ou isenta: nunca bloqueia
  if (!e.planoAtivo) return { bloqueada: true, motivo: "suspensa", avaliacaoAte: null, diasRestantes: null };
  // assinatura no Asaas em dia (ou so atrasada: quem cancela e o Asaas, que desliga o plano)
  if (e.asaasSubscriptionId && (e.asaasStatusAssinatura === "em_dia" || e.asaasStatusAssinatura === "atrasada")) return LIBERADA;
  if (!e.trialEndsAt) return LIBERADA; // escola antiga sem data de avaliacao: nao trava
  const fim = new Date(e.trialEndsAt);
  const avaliacaoAte = fim.toISOString();
  if (fim.getTime() <= agora.getTime()) return { bloqueada: true, motivo: "avaliacao_encerrada", avaliacaoAte, diasRestantes: null };
  const dias = Math.ceil((fim.getTime() - agora.getTime()) / DIA_MS);
  return { bloqueada: false, motivo: null, avaliacaoAte, diasRestantes: dias <= DIAS_AVISO_AVALIACAO ? dias : null };
}

// cache curto: a trava roda em toda requisicao da escola
const cache = new Map<string, { s: SituacaoAcesso; ate: number }>();
export function limparCacheSituacao(escolaId?: string) {
  if (escolaId) cache.delete(escolaId); else cache.clear();
}

export async function situacaoAcessoDaEscola(escolaId: string): Promise<SituacaoAcesso> {
  const c = cache.get(escolaId);
  if (c && c.ate > Date.now()) return c.s;
  const [e] = await db.select({
    isenta: escolasTable.isenta, planoAtivo: escolasTable.planoAtivo, trialEndsAt: escolasTable.trialEndsAt,
    asaasSubscriptionId: escolasTable.asaasSubscriptionId, asaasStatusAssinatura: escolasTable.asaasStatusAssinatura,
  }).from(escolasTable).where(eq(escolasTable.id, escolaId));
  const s = situacaoDaEscola(e);
  cache.set(escolaId, { s, ate: Date.now() + 30_000 });
  return s;
}

// liberados mesmo com a escola bloqueada: quem sou eu, a propria situacao, os dados basicos da
// escola (a tela de bloqueio mostra o nome) e o Painel Master (que tem trava propria)
const LIVRES_BLOQUEADA = ["/eu", "/situacao-acesso", "/master"];
const LEITURAS_LIVRES_BLOQUEADA = ["/escolas/me", "/escolas/planos"];
export function ehLiberadoComEscolaBloqueada(metodo: string, caminhoBruto: string): boolean {
  const caminho = normalizarCaminho(caminhoBruto);
  if (LIVRES_BLOQUEADA.some((p) => caminho === p || caminho.startsWith(p + "/"))) return true;
  return metodo === "GET" && LEITURAS_LIVRES_BLOQUEADA.includes(caminho);
}

export const MSG_BLOQUEIO: Record<MotivoBloqueio, string> = {
  avaliacao_encerrada: "O período de avaliação do NexGrade terminou. Entre em contato com a Nexus Core para efetivar a assinatura.",
  suspensa: "O acesso desta escola ao NexGrade está suspenso. Entre em contato com a Nexus Core.",
};

/** Middleware: escola bloqueada recebe 403 com codigo ESCOLA_BLOQUEADA (a tela mostra o aviso). */
export async function exigirEscolaLiberada(req: Request, res: Response, next: NextFunction) {
  try {
    if (!getAuth(req).userId) return next(); // sem login: cada rota aplica a propria regra
    if (isMaster(req) || ehLiberadoComEscolaBloqueada(req.method, req.path)) return next();
    const s = await situacaoAcessoDaEscola(getEscolaId(req));
    if (!s.bloqueada || !s.motivo) return next();
    res.status(403).json({ error: MSG_BLOQUEIO[s.motivo], codigo: "ESCOLA_BLOQUEADA", motivo: s.motivo, avaliacaoAte: s.avaliacaoAte });
  } catch (err) {
    next(err);
  }
}
