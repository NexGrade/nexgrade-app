/**
 * [PERMISSAO-PAPEL] Filtro unico de permissao (28/09/2026).
 *
 * Toda rota passa por aqui (routes/index.ts), antes dos routers. Regra:
 * - consultas (GET/HEAD/OPTIONS) seguem normalmente;
 * - ALTERACOES (POST/PUT/PATCH/DELETE) so para a coordenacao da escola
 *   (papel "org:admin" na organizacao Clerk);
 * - liberados para quem nao e admin: o portal do professor (/minha-agenda,
 *   que so mexe nos dados do proprio professor logado) e o Painel Master
 *   (/master, que tem trava propria via requireMaster);
 * - sem login: cada rota aplica a propria regra (401);
 * - sem organizacao ainda (onboarding): a "escola" e o proprio usuario.
 *
 * Por ser um filtro unico, rota nova ja nasce protegida -- nao depende de
 * lembrar de proteger rota por rota.
 */
import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";

const METODOS_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

// [PAPEL-RESERVAS] gestor da agenda de reservas (papel personalizado no Clerk).
// Pode criar, confirmar/recusar e excluir reservas; NAO altera as regras por
// professor (prioridade/limite semanal sao da coordenacao) nem a grade.
export const PAPEL_ADMIN = "org:admin";
export const PAPEL_RESERVAS = "org:reservas";

// [CAMINHO-NORMALIZADO] o Express casa rotas sem diferenciar maiusculas e minusculas, entao o
// filtro tambem precisa ignorar: sem isso "/Audit" ou "/reservas/Regras-Professores" escapavam.
export function normalizarCaminho(caminho: string): string {
  const c = caminho.toLowerCase().replace(/\/{2,}/g, "/");
  return c.length > 1 && c.endsWith("/") ? c.slice(0, -1) : c;
}

export function ehAlteracaoDeReservaPermitida(caminhoBruto: string): boolean {
  const caminho = normalizarCaminho(caminhoBruto);
  if (caminho.startsWith("/reservas/regras-professores")) return false;
  return caminho === "/reservas" || caminho === "/reservas/" || caminho.startsWith("/reservas/");
}

// [GESTOR-METADATA] plano Hobby do Clerk so tem 2 papeis: o gestor de reservas e
// org:member com publicMetadata.cargo = "reservas" na membership (so o backend grava).
// Cache curto para nao consultar o Clerk a cada alteracao de reserva.
const cacheGestor = new Map<string, { ok: boolean; ate: number }>();

export function limparCacheGestor(orgId: string, userId: string) {
  cacheGestor.delete(orgId + "|" + userId);
}

export async function ehGestorReservasPorMetadata(orgId: string, userId: string): Promise<boolean> {
  const k = orgId + "|" + userId;
  const c = cacheGestor.get(k);
  if (c && c.ate > Date.now()) return c.ok;
  const r: any = await (clerkClient.organizations as any).getOrganizationMembershipList({
    organizationId: orgId,
    userId: [userId],
    limit: 500,
  });
  const lista: any[] = Array.isArray(r) ? r : r?.data ?? [];
  const m = lista.find((x) => x?.publicUserData?.userId === userId);
  const ok = !!m && m.role === "org:member" && m.publicMetadata?.cargo === "reservas";
  cacheGestor.set(k, { ok, ate: Date.now() + 60_000 });
  return ok;
}
const PREFIXOS_LIBERADOS = ["/minha-agenda", "/master"];

// [LEITURA-ADMIN] consultas restritas a coordenacao: historico, lista de usuarios e
// relatorios de ponto/carga horaria. Gestor de reservas e professor nao leem via API.
const LEITURAS_SOMENTE_ADMIN = [
  "/audit", "/usuarios-acessos", "/export/ponto", "/export/relatorio-seed",
  "/export/relatorio-carga-pdf", "/export/carga-horaria-pdf",
];
export function ehLeituraSomenteAdmin(caminhoBruto: string): boolean {
  const caminho = normalizarCaminho(caminhoBruto);
  if (caminho === "/usuarios") return true; // /usuarios/me segue liberado
  return LEITURAS_SOMENTE_ADMIN.some((p) => caminho === p || caminho.startsWith(p + "/"));
}

export function exigirAdminParaAlterar(req: Request, res: Response, next: NextFunction) {
  if (METODOS_LEITURA.has(req.method)) {
    if (!ehLeituraSomenteAdmin(req.path)) return next();
    const { userId, orgId, orgRole } = getAuth(req);
    if (!userId || !orgId || orgRole === PAPEL_ADMIN) return next();
    res.status(403).json({ error: "Apenas a coordenação da escola pode consultar estes dados." });
    return;
  }
  const caminhoReq = normalizarCaminho(req.path);
  if (PREFIXOS_LIBERADOS.some((p) => caminhoReq === p || caminhoReq.startsWith(p + "/"))) return next();
  const { userId, orgId, orgRole } = getAuth(req);
  if (!userId) return next();
  if (!orgId) return next();
  if (orgRole === PAPEL_ADMIN) return next();
  if (orgRole === PAPEL_RESERVAS) { // [PAPEL-RESERVAS]
    if (ehAlteracaoDeReservaPermitida(req.path)) return next();
    res.status(403).json({ error: "Seu acesso permite apenas administrar reservas." });
    return;
  }
  // [GESTOR-METADATA] org:member com cargo "reservas" na membership: so reservas
  if (orgRole === "org:member" && ehAlteracaoDeReservaPermitida(req.path)) {
    ehGestorReservasPorMetadata(orgId, userId)
      .then((ok) => {
        if (ok) return next();
        res.status(403).json({ error: "Apenas a coordenação da escola pode alterar estes dados." });
      })
      .catch(() => res.status(403).json({ error: "Não foi possível conferir o seu acesso. Tente novamente." }));
    return;
  }
  res.status(403).json({ error: "Apenas a coordenação da escola pode alterar estes dados." });
}