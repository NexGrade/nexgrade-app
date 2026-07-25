import type { Request } from "express";

/**
 * Extrai o ID da escola a partir do token Clerk.
 * Em multi-tenant SaaS: orgId = escola (organização Clerk).
 * Fallback para userId quando o usuário ainda não está numa org (onboarding).
 */
export function getEscolaId(req: Request): string {
  const auth = (req as any).auth;
  const resolvido = auth?.orgId ?? auth?.userId ?? "escola_default";
  // [MIGRACAO TEMPORARIA] Ver comentario no topo do script que gerou
  // este trecho. Reconecta um usuario especifico (o dono da escola
  // piloto ja cadastrada sob "escola_default") a ela, apos a migracao
  // do Clerk para producao ter passado a resolver um userId real em
  // vez de cair no fallback. Remover quando a migracao completa de
  // dados (escola_default -> orgId real) for feita.
  const usuarioMigracao = process.env.MIGRACAO_ESCOLA_DEFAULT_USER_ID;
  if (usuarioMigracao && auth?.userId === usuarioMigracao) {
    return "escola_default";
  }
  return resolvido;
}
