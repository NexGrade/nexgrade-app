import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// [ACESSOS-ESCOLA] Regras com ACESSOS_PELO_BANCO=1: escola vem de req.acesso (ja conferido
// contra o banco por carregarAcesso) e o filtro de permissao usa o CARGO.
// O getAuth do Clerk e trocado por um que devolve o req.auth do teste.
vi.mock("@clerk/express", () => ({ getAuth: (req: any) => req.auth ?? {}, clerkClient: {} }));

import { getEscolaId } from "../escola-id";
import { exigirAdminParaAlterar } from "../permissao";

function req(o: { method?: string; path: string; cargo?: string | null; escolaId?: string | null; userId?: string | null }) {
  const userId = o.userId === undefined ? "user_1" : o.userId;
  return {
    method: o.method ?? "GET",
    path: o.path,
    auth: userId ? { userId } : {},
    acesso: userId
      ? { userId, email: "a@escola.pr.gov.br", escolas: [], escolaId: o.escolaId === undefined ? "org_A" : o.escolaId, nomeEscola: "A", cargo: o.cargo === undefined ? "coordenacao" : o.cargo }
      : undefined,
  } as any;
}
function rodar(r: any): { passou: boolean; status?: number; codigo?: string } {
  let passou = false;
  let status: number | undefined;
  let corpo: any;
  const res: any = { status(s: number) { status = s; return res; }, json(b: any) { corpo = b; return res; } };
  exigirAdminParaAlterar(r, res, () => { passou = true; });
  return { passou, status, codigo: corpo?.codigo };
}

describe("com ACESSOS_PELO_BANCO=1", () => {
  beforeEach(() => { process.env.ACESSOS_PELO_BANCO = "1"; });
  afterEach(() => { delete process.env.ACESSOS_PELO_BANCO; });

  it("getEscolaId usa a escola conferida no banco", () => {
    expect(getEscolaId(req({ path: "/turmas", escolaId: "org_A" }))).toBe("org_A");
  });
  it("getEscolaId sem escola liberada nao cai em escola nenhuma (nem no userId)", () => {
    expect(getEscolaId(req({ path: "/turmas", escolaId: null, cargo: null }))).toBe("sem_escola_user_1");
  });

  it("sem escola liberada: bloqueia tudo menos /eu e /master", () => {
    expect(rodar(req({ path: "/turmas", escolaId: null, cargo: null }))).toMatchObject({ passou: false, status: 403, codigo: "SEM_ESCOLA" });
    expect(rodar(req({ path: "/eu", escolaId: null, cargo: null })).passou).toBe(true);
    expect(rodar(req({ path: "/master/whoami", escolaId: null, cargo: null })).passou).toBe(true);
  });

  it("secretaria tem acesso total (como direcao e coordenacao)", () => {
    for (const cargo of ["direcao", "coordenacao", "secretaria"]) {
      expect(rodar(req({ method: "POST", path: "/turmas", cargo })).passou, cargo).toBe(true);
      expect(rodar(req({ path: "/audit", cargo })).passou, cargo).toBe(true);
      expect(rodar(req({ method: "DELETE", path: "/usuarios-acessos/membros/3", cargo })).passou, cargo).toBe(true);
    }
  });

  it("professor consulta e usa a propria agenda, mas nao altera a escola", () => {
    expect(rodar(req({ path: "/horarios", cargo: "professor" })).passou).toBe(true);
    expect(rodar(req({ method: "POST", path: "/minha-agenda/reservas", cargo: "professor" })).passou).toBe(true);
    expect(rodar(req({ method: "POST", path: "/turmas", cargo: "professor" }))).toMatchObject({ passou: false, status: 403 });
    expect(rodar(req({ path: "/usuarios-acessos", cargo: "professor" }))).toMatchObject({ passou: false, status: 403 });
    expect(rodar(req({ path: "/Audit", cargo: "professor" }))).toMatchObject({ passou: false, status: 403 });
  });

  it("gestor de reservas so altera reservas (sem as regras por professor)", () => {
    expect(rodar(req({ method: "POST", path: "/reservas", cargo: "reservas" })).passou).toBe(true);
    expect(rodar(req({ method: "PUT", path: "/reservas/regras-professores/2", cargo: "reservas" }))).toMatchObject({ passou: false, status: 403 });
    expect(rodar(req({ method: "POST", path: "/horarios", cargo: "reservas" }))).toMatchObject({ passou: false, status: 403 });
  });
});

describe("com a chave desligada (como antes)", () => {
  it("getEscolaId continua usando a organizacao do Clerk", () => {
    const r: any = { auth: { orgId: "org_X", userId: "user_1" }, acesso: { escolaId: "org_A" } };
    expect(getEscolaId(r)).toBe("org_X");
  });
});
