import { describe, expect, it } from "vitest";
import { hojeEmBrasilia, textoConfirmacao, validarPlano, viradaLiberadaPorData } from "../virada-ano";

const turmas = [{ id: 1, nome: "6A" }, { id: 2, nome: "6B" }, { id: 3, nome: "9A" }];
const profs = [{ id: 10 }, { id: 11 }];
const base = { excluirTurmas: [] as number[], duplicarTurmas: [] as Array<{ origemId: number; nome: string }>, professoresQueSaem: [] as number[], confirmacao: "VIRAR 2027" };

describe("validarPlano (virada do ano letivo)", () => {
  it("aceita o plano padrao (todas as turmas continuam)", () => {
    expect(validarPlano(base, turmas, profs, 2027)).toEqual([]);
  });
  it("exige a confirmacao com o ano certo (sem diferenciar maiusculas)", () => {
    expect(validarPlano({ ...base, confirmacao: "virar 2027" }, turmas, profs, 2027)).toEqual([]);
    expect(validarPlano({ ...base, confirmacao: "VIRAR 2026" }, turmas, profs, 2027)[0]).toMatch(/VIRAR 2027/);
  });
  it("recusa turma e professor de outra escola", () => {
    const e = validarPlano({ ...base, excluirTurmas: [99], professoresQueSaem: [77] }, turmas, profs, 2027);
    expect(e.join(" ")).toMatch(/Turma 99/);
    expect(e.join(" ")).toMatch(/Professor 77/);
  });
  it("recusa nome repetido ao duplicar, mas aceita reusar o nome de uma turma excluida", () => {
    expect(validarPlano({ ...base, duplicarTurmas: [{ origemId: 1, nome: "6b" }] }, turmas, profs, 2027).join(" ")).toMatch(/6B/);
    expect(validarPlano({ ...base, excluirTurmas: [2], duplicarTurmas: [{ origemId: 1, nome: "6B" }] }, turmas, profs, 2027)).toEqual([]);
  });
  it("recusa excluir e duplicar a mesma turma, e excluir todas", () => {
    expect(validarPlano({ ...base, excluirTurmas: [1], duplicarTurmas: [{ origemId: 1, nome: "6C" }] }, turmas, profs, 2027).join(" ")).toMatch(/excluir e para duplicar/);
    expect(validarPlano({ ...base, excluirTurmas: [1, 2, 3] }, turmas, profs, 2027).join(" ")).toMatch(/todas as turmas/);
  });
});

describe("liberacao por data", () => {
  it("libera no dia do fim do 3o trimestre e depois", () => {
    expect(viradaLiberadaPorData("2026-12-17", "2026-12-18", 2026)).toBe(false);
    expect(viradaLiberadaPorData("2026-12-18", "2026-12-18", 2026)).toBe(true);
    expect(viradaLiberadaPorData("2027-01-10", "2026-12-18", 2026)).toBe(true);
  });
  it("sem calendario, so a partir de 31/12", () => {
    expect(viradaLiberadaPorData("2026-12-30", null, 2026)).toBe(false);
    expect(viradaLiberadaPorData("2026-12-31", null, 2026)).toBe(true);
  });
  it("data de hoje no horario de Brasilia e texto de confirmacao", () => {
    expect(hojeEmBrasilia(new Date("2026-12-31T02:00:00Z"))).toBe("2026-12-30"); // 23h em Brasilia
    expect(textoConfirmacao(2027)).toBe("VIRAR 2027");
  });
});
