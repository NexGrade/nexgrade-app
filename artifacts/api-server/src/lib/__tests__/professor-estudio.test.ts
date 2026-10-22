import { describe, it, expect } from "vitest";
import { ehProfessorEstudio, calcularHoraAtividadePorTurno } from "../hora-atividade";

// [ESTUDIO-SEM-HA] aulas do estudio da SEED nao sao professor de verdade e nao pedem HA
describe("ehProfessorEstudio", () => {
  it("reconhece os cadastros do estúdio da SEED", () => {
    expect(ehProfessorEstudio("Escola Estúdio (SEED) - Banco de Dados")).toBe(true);
    expect(ehProfessorEstudio("Escola Estudio (SEED) - Análise e Método")).toBe(true);
    expect(ehProfessorEstudio("  escola estúdio - x")).toBe(true);
  });
  it("não pega professor de verdade", () => {
    expect(ehProfessorEstudio("Débora")).toBe(false);
    expect(ehProfessorEstudio("Escola")).toBe(false);
    expect(ehProfessorEstudio("Maria do Estúdio")).toBe(false);
    expect(ehProfessorEstudio(null)).toBe(false);
  });
  it("professor de verdade continua pedindo HA pela tabela", () => {
    expect(calcularHoraAtividadePorTurno({ matutino: 6 })).toEqual({ matutino: 2 });
  });
});
