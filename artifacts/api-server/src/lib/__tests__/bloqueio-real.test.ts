import { describe, it, expect } from "vitest";
import { ehHaFixa, ehHaFormacao, MOTIVO_HA_FORMACAO } from "../bloqueio-real";

describe("HA de formação (FORM)", () => {
  it("reconhece o motivo gravado pelo script de formação", () => {
    expect(ehHaFormacao(MOTIVO_HA_FORMACAO)).toBe(true);
  });

  it("é HA fixa: conta como HA e o motor não põe aula ali", () => {
    expect(ehHaFixa({ horaAtividadeObrigatoria: true, motivo: MOTIVO_HA_FORMACAO })).toBe(true);
  });

  it("não confunde HA fixa comum, HA automática nem vazio com FORM", () => {
    expect(ehHaFormacao("HA fixa (definida manualmente)")).toBe(false);
    expect(ehHaFormacao("Hora-atividade institucional (recalculada automaticamente)")).toBe(false);
    expect(ehHaFormacao(null)).toBe(false);
    expect(ehHaFormacao(undefined)).toBe(false);
  });
});
