import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { acessosPeloBanco, acessoDe } from "./acesso";
/**
 * Extrai o ID da escola da requisicao.
 * [ACESSOS-ESCOLA] Com ACESSOS_PELO_BANCO=1: a escola vem do nosso banco (lib/acesso.ts),
 * ja conferida contra os acessos da pessoa. Sem escola liberada, devolve um id que nao
 * existe ("sem_escola_..."), para nenhuma consulta trazer dados de escola alguma.
 * Chave desligada (como antes): orgId = escola (organizacao Clerk); fallback para userId
 * quando o usuario ainda nao esta numa org (onboarding).
 */
export function getEscolaId(req: Request): string {
  const { orgId, userId } = getAuth(req);
  if (acessosPeloBanco()) {
    return acessoDe(req)?.escolaId ?? "sem_escola_" + (userId ?? "anonimo");
  }
  return orgId ?? userId ?? "escola_default";
}
