import type { Request } from "express";

/**
 * Extrai o ID da escola a partir do token Clerk.
 * Em multi-tenant SaaS: orgId = escola (organização Clerk).
 * Fallback para userId quando o usuário ainda não está numa org (onboarding).
 */
export function getEscolaId(req: Request): string {
  const auth = (req as any).auth;
  return auth?.orgId ?? auth?.userId ?? "escola_default";
}
