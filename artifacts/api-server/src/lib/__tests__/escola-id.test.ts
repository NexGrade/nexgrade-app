import { describe, it, expect, vi } from "vitest";

// O @clerk/express 2.x so aceita, em getAuth, um req.auth criado pelo clerkMiddleware real (uma funcao
// marcada por dentro). Aqui o foco e a REGRA DA ESCOLA, nao o Clerk: trocamos o getAuth por um que
// devolve o req.auth do teste.
vi.mock("@clerk/express", () => ({ getAuth: (req: any) => req.auth ?? {} }));

import { getEscolaId } from "../escola-id";

// RNF-SEG-04: este é exatamente o mecanismo que mantém os dados de
// escolas diferentes isolados em toda a API. Uma regressão aqui
// (ex. inverter a ordem de precedência, ou trocar "??" por "||" e
// deixar orgId="" cair no fallback errado) reintroduziria os
// vazamentos multi-tenant corrigidos na revisão de segurança.
function reqComAuth(auth: { orgId?: string; userId?: string } | undefined) {
  return { auth } as any;
}

describe("getEscolaId", () => {
  it("usa orgId quando o usuário pertence a uma organização (escola já com onboarding feito)", () => {
    expect(getEscolaId(reqComAuth({ orgId: "org_123", userId: "user_456" }))).toBe("org_123");
  });

  it("usa userId como fallback quando não há orgId (durante o onboarding)", () => {
    expect(getEscolaId(reqComAuth({ userId: "user_456" }))).toBe("user_456");
  });

  it("cai em escola_default apenas quando não há sessão nenhuma", () => {
    expect(getEscolaId(reqComAuth(undefined))).toBe("escola_default");
    expect(getEscolaId(reqComAuth({}))).toBe("escola_default");
  });
});
