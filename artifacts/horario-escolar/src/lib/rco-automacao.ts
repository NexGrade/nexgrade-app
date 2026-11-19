// [RCO-AUTOMACAO-DESLIGADA] (19/11/2026) Decisao da dona: ate a adequacao a LGPD e a orientacao
// juridica, o NexGrade so gera o ARQUIVO da grade, que a secretaria importa no RCO pelo "Incluir via
// Arquivo", com o proprio acesso. Ficam escondidos: o atalho "Gravar no RCO" e o script do F12, que gravam
// dentro do RCO. O codigo continua no projeto. A tela "Arquivo do RCO" continua: quem baixa o arquivo
// no RCO e a direcao ou a secretaria, com o proprio acesso, a pedido da equipe NexGrade.
// Para religar: true aqui e RCO_AUTOMACAO_LIGADA=1 na API (artifacts/api-server/src/lib/rco-atalho.ts).
export const AUTOMACAO_RCO_LIGADA = false;
