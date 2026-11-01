import { describe, it, expect, vi } from "vitest";

// [LIMITE-DISCIPLINA] ordem do limite diario: turma+disciplina > disciplina na escola > padrao da rede.
vi.mock("@workspace/db", () => ({ db: {}, configuracoesTable: {} }));

import { lerLimites, limiteAulasDia } from "../limite-disciplina";

describe("lerLimites", () => {
  it("le o objeto {disciplinaId: n} e ignora valores fora de 1 a 6", () => {
    const m = lerLimites({ "7": 1, "8": 2, "9": 0, "10": 7, "11": 2.5, "12": "2", abc: 3 });
    expect([...m]).toEqual([[7, 1], [8, 2]]);
  });
  it("valor ausente ou de outro formato vira mapa vazio", () => {
    for (const v of [null, undefined, 3, "x", [1, 2]]) expect(lerLimites(v).size).toBe(0);
  });
});

describe("limiteAulasDia", () => {
  const porDisciplina = new Map([[7, 1]]);
  it("excecao da turma vale mais que o limite da disciplina", () => {
    expect(limiteAulasDia({ disciplinaId: 7, maxAulasConsecutivasDia: 2 }, porDisciplina, 3)).toBe(2);
  });
  it("sem excecao usa o limite da disciplina na escola", () => {
    expect(limiteAulasDia({ disciplinaId: 7, maxAulasConsecutivasDia: null }, porDisciplina, 3)).toBe(1);
  });
  it("sem nada configurado usa o padrao da rede", () => {
    expect(limiteAulasDia({ disciplinaId: 8, maxAulasConsecutivasDia: undefined }, porDisciplina, 3)).toBe(3);
  });
});
