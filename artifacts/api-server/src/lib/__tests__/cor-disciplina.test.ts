import { describe, it, expect } from "vitest";
import { corParaDisciplina, corDaPaleta } from "../cor-disciplina";

describe("[CORES-DISCIPLINAS] cor de disciplina nova", () => {
  const ref = { porCodigo: new Map([[2, "#795548"]]), porNome: new Map([["arte", "#f59e0b"]]) };
  it("usa a cor das outras escolas pelo Código Externo", () => {
    expect(corParaDisciplina(ref, 2, "Qualquer nome")).toBe("#795548");
  });
  it("sem código conhecido, usa a cor pelo nome (sem acento/caixa)", () => {
    expect(corParaDisciplina(ref, null, "  ARTE ")).toBe("#f59e0b");
  });
  it("disciplina nova em todas: cor fixa da paleta, sempre a mesma para o código", () => {
    const a = corParaDisciplina(ref, 9999, "Nova");
    expect(a).toBe(corDaPaleta("cod9999"));
    expect(corParaDisciplina(ref, 9999, "Outro nome")).toBe(a);
  });
});
