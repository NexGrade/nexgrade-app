// [RCO-AUTOMACAO-CHAVE] (19/11/2026) Mostra o atalho "Preencher no RCO" e o script do F12, que preenchem a
// grade dentro da tela do RCO, na sessao da propria escola. Decisao da dona: o atalho e essencial e fica
// ligado; so os textos mudaram (a escola e quem lanca a grade no RCO, com o proprio acesso).
// Para desligar: false aqui e RCO_AUTOMACAO_LIGADA=0 na API (artifacts/api-server/src/lib/rco-atalho.ts).
export const AUTOMACAO_RCO_LIGADA = true;
