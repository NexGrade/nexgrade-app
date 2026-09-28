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
import { getAuth } from "@clerk/express";

const METODOS_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);
const PREFIXOS_LIBERADOS = ["/minha-agenda", "/master"];

export function exigirAdminParaAlterar(req: Request, res: Response, next: NextFunction) {
  if (METODOS_LEITURA.has(req.method)) return next();
  if (PREFIXOS_LIBERADOS.some((p) => req.path === p || req.path.startsWith(p + "/"))) return next();
  const { userId, orgId, orgRole } = getAuth(req);
  if (!userId) return next();
  if (!orgId) return next();
  if (orgRole === "org:admin") return next();
  res.status(403).json({ error: "Apenas a coordenação da escola pode alterar estes dados." });
}