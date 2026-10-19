import { describe, expect, it } from "vitest";
import { haFechaPausaEntreTurnos } from "../recalcular-ha";

const limites = new Map([
  ["matutino", { primeira: 1, ultima: 6 }],
  ["vespertino", { primeira: 1, ultima: 6 }],
]);
const aulas = (...chaves: string[]) => new Map([["matutino", new Set(chaves)]]);

describe("haFechaPausaEntreTurnos", () => {
  it("1a aula da tarde, no dia com a ultima aula da manha: fecha a pausa", () => {
    expect(haFechaPausaEntreTurnos("vespertino", 1, 0, limites, aulas("0-6"))).toBe(true);
  });
  it("outro dia (sem aula na ultima da manha): nao", () => {
    expect(haFechaPausaEntreTurnos("vespertino", 1, 1, limites, aulas("0-6"))).toBe(false);
  });
  it("outra aula da tarde: nao", () => {
    expect(haFechaPausaEntreTurnos("vespertino", 2, 0, limites, aulas("0-6"))).toBe(false);
  });
  it("manha ou noite: nao", () => {
    expect(haFechaPausaEntreTurnos("matutino", 1, 0, limites, aulas("0-6"))).toBe(false);
    expect(haFechaPausaEntreTurnos("noturno", 1, 0, limites, aulas("0-6"))).toBe(false);
  });
  it("sem esquema de horarios do turno: nao", () => {
    expect(haFechaPausaEntreTurnos("vespertino", 1, 0, new Map(), aulas("0-6"))).toBe(false);
  });
});
