import { describe, it, expect } from "vitest";
import { sobrepor, nomeDaRequisicao, chaveDisp, type LinhaDisp } from "../disponibilidade-experimento";

// [DISP-EXPERIMENTAL] (06/11/2026) regras puras da disponibilidade dentro de um experimento
const linha = (professorId: number, diaSemana: number, horarioSlot: number, extra: Partial<LinhaDisp> = {}): LinhaDisp => ({
  id: 1, professorId, diaSemana, horarioSlot, turno: "matutino", disponivel: false, motivo: "Bloqueio", horaAtividadeObrigatoria: false, createdAt: new Date(0), ...extra,
});

describe("disponibilidade do experimento [DISP-EXPERIMENTAL]", () => {
  it("a linha do experimento substitui a oficial de mesma chave (professor, dia, aula, turno)", () => {
    const oficial = [linha(1, 0, 1), linha(1, 0, 2), linha(1, 0, 1, { turno: "noturno" })];
    const exp = [linha(1, 0, 1, { id: -5, disponivel: true, motivo: "" }), linha(1, 4, 3, { id: -6, horaAtividadeObrigatoria: true, disponivel: true })];
    const r = sobrepor(oficial, exp);
    expect(r.map((x) => [chaveDisp(x), x.disponivel])).toEqual([
      ["1|0|2|matutino", false], ["1|0|1|noturno", false], ["1|0|1|matutino", true], ["1|4|3|matutino", true],
    ]);
  });

  it("respeita o filtro da consulta oficial e nao muda nada sem experimento", () => {
    const oficial = [linha(1, 0, 1), linha(2, 0, 1)];
    const exp = [linha(1, 0, 1, { id: -1, disponivel: true }), linha(3, 1, 1, { id: -2 })];
    expect(sobrepor(oficial.filter((x) => x.professorId === 1), exp, (d) => d.professorId === 1).map((x) => [x.professorId, x.disponivel])).toEqual([[1, true]]);
    expect(sobrepor(oficial, [])).toBe(oficial);
  });

  it("acha o experimento da requisicao: corpo, URL ou /experimentais/:nome/(simulacao|fechar-janela|trocar)", () => {
    expect(nomeDaRequisicao({ body: { nomeExperimental: "Teste A" }, query: {}, path: "/gerar-cpsat-async" })).toBe("Teste A");
    expect(nomeDaRequisicao({ body: { nomeExperimental: "Oficial", experimental: false }, query: {}, path: "/gerar" })).toBeNull();
    expect(nomeDaRequisicao({ body: {}, query: { nomeExperimental: "B" }, path: "/grade-pdf/professor" })).toBe("B");
    expect(nomeDaRequisicao({ body: {}, query: {}, path: "/experimentais/Teste%20C/simulacao" })).toBe("Teste C");
    expect(nomeDaRequisicao({ body: {}, query: {}, path: "/experimentais/Teste%20C/promover" })).toBeNull(); // promover aplica de outro jeito
    expect(nomeDaRequisicao({ body: {}, query: {}, path: "/experimentais" })).toBeNull();
  });
});
