import { describe, it, expect } from "vitest";
import { tempoDoMotor, TEMPO_TOTAL_PADRAO_S } from "../tempo-geracao";

// [TEMPO-TOTAL] (01/11/2026) o tempo da tela vale para a geracao inteira, nao para cada etapa
describe("divisao do tempo total da geracao", () => {
  it("geracao conjunta: coordenacao + duas fases (com as trocas finais) cabem no tempo pedido", () => {
    for (const total of [120, 300, 600]) {
      const t = tempoDoMotor(total, true);
      const gasto = t.tempoCoordenacaoS + 2 * (t.tempoFaseS + 20);
      expect(gasto, `total ${total}`).toBeLessThanOrEqual(Math.max(total, 30 + 2 * (30 + 20))); // 130s e o minimo possivel
      expect(t.tempoCoordenacaoS).toBeLessThanOrEqual(120); // nunca mais que o teto de hoje
    }
    expect(tempoDoMotor(300, true)).toMatchObject({ tempoCoordenacaoS: 120, tempoFaseS: 70 });
  });

  it("um nivel, turma ou melhoria: o tempo pedido menos as trocas finais", () => {
    expect(tempoDoMotor(300, false).tempoLimiteS).toBe(280);
    expect(tempoDoMotor(120, false).tempoLimiteS).toBe(100);
  });

  it("tempo muito curto nao vira zero: cada chamada tem pelo menos 30s", () => {
    const t = tempoDoMotor(2, true);
    expect(t.tempoCoordenacaoS).toBe(30);
    expect(t.tempoFaseS).toBe(30);
    expect(tempoDoMotor(2, false).tempoLimiteS).toBe(30);
  });

  it("o servidor espera a resposta do motor um pouco alem do tempo das etapas", () => {
    const t = tempoDoMotor(TEMPO_TOTAL_PADRAO_S, true);
    expect(t.esperaMaximaS).toBeGreaterThan(t.tempoCoordenacaoS + 2 * (t.tempoFaseS + 20));
  });
});
