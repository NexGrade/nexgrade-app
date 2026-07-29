import type { Request } from "express";
/**
 * Extrai o ID da escola a partir do token Clerk.
 * Em multi-tenant SaaS: orgId = escola (organizacao Clerk).
 * Fallback para userId quando o usuario ainda nao esta numa org (onboarding).
 */
export function getEscolaId(req: Request): string {
  const auth = (req as any).auth;
  return auth?.orgId ?? auth?.userId ?? "escola_default";
}