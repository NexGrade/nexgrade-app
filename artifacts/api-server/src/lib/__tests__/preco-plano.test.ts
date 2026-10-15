import { describe, it, expect } from "vitest";
import { valorAssinatura, ehPlanoPago } from "../preco-plano";

// [PRECO-POR-TURMA] R$ 30 por turma por ano, anual a vista ou 12x, sem minimo.
const escola = { nome: "NexGrade Escola", precoMensal: 0, precoAnual: null, cobranca: "por_turma", precoPorTurmaAnual: 3000 };

describe("valorAssinatura por turma", () => {
  it("anual: turmas x R$ 30", () => {
    expect(valorAssinatura(escola, 55, "anual").valorReais).toBe(1650);
  });
  it("mensal: o anual em 12 parcelas", () => {
    expect(valorAssinatura(escola, 55, "mensal").valorReais).toBe(137.5);
    expect(valorAssinatura(escola, 7, "mensal").valorReais).toBe(17.5);
  });
  it("sem valor minimo", () => {
    expect(valorAssinatura(escola, 1, "anual").valorReais).toBe(30);
  });
  it("conta como plano pago", () => {
    expect(ehPlanoPago(escola)).toBe(true);
    expect(ehPlanoPago({ ...escola, cobranca: "fixa" })).toBe(false);
  });
});

describe("valorAssinatura fixa (como antes)", () => {
  const pro = { nome: "Pro", precoMensal: 9700, precoAnual: 97000 };
  it("usa precoMensal e precoAnual", () => {
    expect(valorAssinatura(pro, 50, "mensal").valorReais).toBe(97);
    expect(valorAssinatura(pro, 50, "anual").valorReais).toBe(970);
  });
});
