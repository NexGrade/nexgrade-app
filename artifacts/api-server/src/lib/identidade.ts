// [ACESSOS-ESCOLA] (15/10/2026) QUEM e a pessoa logada -- o unico ponto do servidor que
// conversa com o fornecedor de login (hoje o Clerk) para identidade. Escola e cargo
// NAO vem daqui: vem de lib/acesso.ts (nosso banco). Para trocar de fornecedor no
// futuro (WorkOS, Supabase Auth...), basta reescrever este arquivo.
import type { Request } from "express";
import { getAuth, clerkClient } from "@clerk/express";

export function usuarioLogado(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

export function normalizarEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

// cache curto: evita consultar o Clerk a cada requisicao
const cacheEmail = new Map<string, { email: string | null; ate: number }>();
const DEZ_MINUTOS = 10 * 60_000;

/**
 * E-mail VERIFICADO da pessoa logada (minusculo), ou null.
 * 1) se o token de sessao trouxer a claim "email" (configuracao do painel do Clerk:
 *    Sessions > Customize session token: {"email": "{{user.primary_email_address}}"}),
 *    usa direto, sem chamada extra;
 * 2) senao, busca a conta no Clerk e usa o e-mail principal, so se estiver verificado.
 */
export async function emailVerificado(req: Request): Promise<string | null> {
  const { userId, sessionClaims } = getAuth(req);
  if (!userId) return null;
  const doToken = (sessionClaims as Record<string, unknown> | null | undefined)?.email;
  if (typeof doToken === "string" && doToken.includes("@")) return normalizarEmail(doToken);

  const c = cacheEmail.get(userId);
  if (c && c.ate > Date.now()) return c.email;
  const u = await clerkClient.users.getUser(userId);
  const principal = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
  const email = principal && principal.verification?.status === "verified" ? normalizarEmail(principal.emailAddress) : null;
  cacheEmail.set(userId, { email, ate: Date.now() + DEZ_MINUTOS });
  return email;
}
