// [TEMPO-TOTAL] (01/11/2026) O "Tempo limite" da tela vale para a geracao INTEIRA. Antes ia inteiro para CADA etapa
// (coordenacao + Fundamental + Medio/Tecnico + plano B): 120s na tela davam 4-5 min de espera (simulacoes de 01/11).
// Esta conta divide o orcamento de UMA chamada ao motor entre as etapas dela. No motor (cpsat-service), cada
// gerar_grade respeita o tempo pedido nas fases de calculo e soma ~20s da troca final de aulas (reduzir_janelas).

export const TEMPO_TOTAL_PADRAO_S = 300;
export const TEMPO_MINIMO_CHAMADA_S = 30;
const TROCAS_FINAIS_S = 20; // reduzir_janelas no fim de cada gerar_grade do motor

export type TempoDoMotor = {
  tempoLimiteS: number; // gerar_grade (um nivel, turma ou melhoria)
  tempoCoordenacaoS: number; // so na geracao conjunta: acerto dos professores-ponte
  tempoFaseS: number; // so na geracao conjunta: cada fase (Fundamental, Medio/Tecnico)
  esperaMaximaS: number; // quanto o servidor espera a resposta do motor (com folga de rede)
};

/** Divide o orcamento (segundos) de uma chamada ao motor. `coordenacaoMaxS` e o teto da coordenacao (CPSAT_TEMPO_COORDENACAO_S). */
export function tempoDoMotor(orcamentoS: number, usarCoordenacao: boolean, coordenacaoMaxS = 120): TempoDoMotor {
  const orcamento = Math.max(TEMPO_MINIMO_CHAMADA_S, Math.floor(orcamentoS));
  if (!usarCoordenacao) {
    const tempoLimiteS = Math.max(TEMPO_MINIMO_CHAMADA_S, orcamento - TROCAS_FINAIS_S);
    return { tempoLimiteS, tempoCoordenacaoS: 0, tempoFaseS: 0, esperaMaximaS: tempoLimiteS + TROCAS_FINAIS_S + 60 };
  }
  // 40% para acertar as pontes (sem passar do teto de hoje); o resto, menos as trocas finais, para as duas fases.
  // Com pouco tempo, a coordenacao cede primeiro: as fases nunca ficam abaixo do minimo.
  const sobraParaCoordenacao = orcamento - 2 * (TEMPO_MINIMO_CHAMADA_S + TROCAS_FINAIS_S);
  const tempoCoordenacaoS = Math.max(TEMPO_MINIMO_CHAMADA_S, Math.min(coordenacaoMaxS, Math.round(orcamento * 0.4), sobraParaCoordenacao));
  const tempoFaseS = Math.max(TEMPO_MINIMO_CHAMADA_S, Math.floor((orcamento - tempoCoordenacaoS - 2 * TROCAS_FINAIS_S) / 2));
  return {
    tempoLimiteS: tempoFaseS,
    tempoCoordenacaoS,
    tempoFaseS,
    esperaMaximaS: tempoCoordenacaoS + 2 * (tempoFaseS + TROCAS_FINAIS_S) + 90,
  };
}
