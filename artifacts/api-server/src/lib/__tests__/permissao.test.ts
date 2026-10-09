import { describe, it, expect } from "vitest";
import { ehAlteracaoDeReservaPermitida, ehLeituraSomenteAdmin, normalizarCaminho } from "../permissao";

// O Express casa rotas sem diferenciar maiusculas e minusculas. O filtro de permissao precisa fazer
// o mesmo, senao "/Audit" (leitura) ou "/reservas/Regras-Professores" (gestor de reservas) escapam.
describe("normalizarCaminho", () => {
  it("ignora maiusculas, barras repetidas e barra final", () => {
    expect(normalizarCaminho("/Audit/")).toBe("/audit");
    expect(normalizarCaminho("//Export//Ponto")).toBe("/export/ponto");
    expect(normalizarCaminho("/")).toBe("/");
  });
});

describe("ehLeituraSomenteAdmin", () => {
  it("bloqueia as consultas da coordenacao, em qualquer caixa", () => {
    for (const c of ["/audit", "/Audit", "/AUDIT/", "/usuarios", "/Usuarios/", "/usuarios-acessos", "/USUARIOS-ACESSOS/membros", "/export/ponto", "/Export/Relatorio-Seed"]) {
      expect(ehLeituraSomenteAdmin(c), c).toBe(true);
    }
  });
  it("libera o que gestor e professor precisam", () => {
    for (const c of ["/usuarios/me", "/reservas", "/horarios", "/escolas/me", "/export/reservas-pdf"]) {
      expect(ehLeituraSomenteAdmin(c), c).toBe(false);
    }
  });
});

describe("ehAlteracaoDeReservaPermitida (gestor de reservas)", () => {
  it("permite criar, alterar e excluir reservas", () => {
    for (const c of ["/reservas", "/reservas/", "/Reservas/12", "/RESERVAS/12/status"]) {
      expect(ehAlteracaoDeReservaPermitida(c), c).toBe(true);
    }
  });
  it("nao permite mexer nas regras por professor, em nenhuma caixa", () => {
    for (const c of ["/reservas/regras-professores", "/reservas/Regras-Professores", "/Reservas/REGRAS-PROFESSORES/3"]) {
      expect(ehAlteracaoDeReservaPermitida(c), c).toBe(false);
    }
  });
  it("nao permite alterar outras areas", () => {
    for (const c of ["/turmas", "/professores/1", "/horarios"]) {
      expect(ehAlteracaoDeReservaPermitida(c), c).toBe(false);
    }
  });
});
