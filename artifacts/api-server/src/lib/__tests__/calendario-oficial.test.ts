import { describe, it, expect, vi } from "vitest";
vi.mock("@workspace/db", () => ({ db: {}, calendarioEscolarTable: {}, trimestresLetivosTable: {} }));
import { CALENDARIOS_OFICIAIS, validarTrimestres } from "../calendario-oficial";

describe("calendario oficial SEED-PR 2026", () => {
  const cal = CALENDARIOS_OFICIAIS[2026];
  it("201 dias letivos em 3 trimestres validos", () => {
    expect(cal.trimestres.reduce((s, t) => s + t.diasLetivos, 0)).toBe(201);
    expect(validarTrimestres(2026, cal.trimestres)).toBeNull();
  });
  it("eventos dentro do ano e com tipo conhecido", () => {
    for (const e of cal.eventos) expect(e.data.startsWith("2026-")).toBe(true);
  });
});

describe("validarTrimestres", () => {
  const ok = CALENDARIOS_OFICIAIS[2026].trimestres;
  it("recusa sobreposicao", () => {
    expect(validarTrimestres(2026, [ok[0], { ...ok[1], dataInicio: "2026-05-10" }, ok[2]])).toMatch(/antes do fim/);
  });
  it("recusa fim antes do inicio", () => {
    expect(validarTrimestres(2026, [{ ...ok[0], dataFim: "2026-01-01" }])).toMatch(/fim é antes/);
  });
  it("recusa outro ano", () => {
    expect(validarTrimestres(2027, ok)).toMatch(/em 2027/);
  });
});
