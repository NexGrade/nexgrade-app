// [RCO-AUTOMACAO-DESLIGADA] (19/11/2026) Decisao da dona: ate a adequacao a LGPD e a orientacao
// juridica, o NexGrade so gera o ARQUIVO da grade, que a secretaria importa no RCO pelo "Incluir via
// Arquivo", com o proprio acesso. Ficam escondidos: o atalho "Gravar no RCO", o script do F12 e a tela
// "Arquivo do RCO" (o arquivo era baixado do RCO pelo suporte com F12). O codigo continua no projeto.
// Para religar: true aqui e RCO_AUTOMACAO_LIGADA=1 na API (artifacts/api-server/src/lib/rco-atalho.ts).
export const AUTOMACAO_RCO_LIGADA = false;
