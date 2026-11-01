import { describe, it, expect } from "vitest";
import { situacaoDaEscola, ehLiberadoComEscolaBloqueada } from "../situacao-escola";

// [TRAVA-AVALIACAO] regra da trava do fim dos 30 dias de cortesia
const AGORA = new Date("2026-11-01T15:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
const base = { isenta: false, planoAtivo: true, trialEndsAt: dias(10) as Date | null, asaasSubscriptionId: null as string | null, asaasStatusAssinatura: null as string | null };

describe("situacaoDaEscola [TRAVA-AVALIACAO]", () => {
  it("em avaliacao: liberada; aviso so nos ultimos 7 dias", () => {
    expect(situacaoDaEscola(base, AGORA)).toMatchObject({ bloqueada: false, diasRestantes: null });
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(7) }, AGORA)).toMatchObject({ bloqueada: false, diasRestantes: 7 });
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(0.5) }, AGORA)).toMatchObject({ bloqueada: false, diasRestantes: 1 });
  });
  it("avaliacao encerrada sem assinatura: bloqueada", () => {
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(-1) }, AGORA)).toMatchObject({ bloqueada: true, motivo: "avaliacao_encerrada" });
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(-1), asaasSubscriptionId: "sub_1", asaasStatusAssinatura: "cancelada" }, AGORA)).toMatchObject({ bloqueada: true });
  });
  it("isenta, assinatura em dia (ou so atrasada) e escola sem data de avaliacao: liberada", () => {
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(-30), isenta: true }, AGORA).bloqueada).toBe(false);
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(-30), asaasSubscriptionId: "sub_1", asaasStatusAssinatura: "em_dia" }, AGORA)).toMatchObject({ bloqueada: false, diasRestantes: null });
    expect(situacaoDaEscola({ ...base, trialEndsAt: dias(-30), asaasSubscriptionId: "sub_1", asaasStatusAssinatura: "atrasada" }, AGORA).bloqueada).toBe(false);
    expect(situacaoDaEscola({ ...base, trialEndsAt: null }, AGORA).bloqueada).toBe(false);
    expect(situacaoDaEscola(undefined, AGORA).bloqueada).toBe(false);
  });
  it("Escola ativa desligado no Painel Master: suspensa (menos isenta)", () => {
    expect(situacaoDaEscola({ ...base, planoAtivo: false }, AGORA)).toMatchObject({ bloqueada: true, motivo: "suspensa" });
    expect(situacaoDaEscola({ ...base, planoAtivo: false, asaasSubscriptionId: "sub_1", asaasStatusAssinatura: "em_dia" }, AGORA).motivo).toBe("suspensa");
    expect(situacaoDaEscola({ ...base, planoAtivo: false, isenta: true }, AGORA).bloqueada).toBe(false);
  });
});

describe("ehLiberadoComEscolaBloqueada", () => {
  it("libera so o necessario para a tela de bloqueio e o Painel Master, em qualquer caixa", () => {
    for (const [m, c] of [["GET", "/eu"], ["GET", "/situacao-acesso"], ["GET", "/Master/escolas"], ["PATCH", "/master/escolas/x"], ["GET", "/escolas/me"], ["GET", "/Escolas/Planos"]]) {
      expect(ehLiberadoComEscolaBloqueada(m!, c!), `${m} ${c}`).toBe(true);
    }
  });
  it("o resto da escola fica bloqueado", () => {
    for (const [m, c] of [["GET", "/horarios"], ["GET", "/minha-agenda"], ["POST", "/reservas"], ["PUT", "/escolas/logo"], ["POST", "/escolas/me"], ["GET", "/export/grade"], ["GET", "/masterx"]]) {
      expect(ehLiberadoComEscolaBloqueada(m!, c!), `${m} ${c}`).toBe(false);
    }
  });
});
