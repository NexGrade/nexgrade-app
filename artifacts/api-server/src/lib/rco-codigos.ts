/**
 * [CODIGOS-RCO-TELA] (14/10/2026) Regra unica do codigo da disciplina no arquivo do RCO
 * (CODDISC), usada pela exportacao (routes/export.ts) e pela tela "Codigos do RCO"
 * (routes/codigos-rco.ts), para as duas mostrarem sempre o mesmo codigo.
 *
 * Ordem: disciplinas.codigo_externo_rco; senao codigos_rco_disciplina pelo codigo_sae;
 * senao o dicionario abaixo (codigos externos confirmados por nome). NUNCA o SAE puro
 * (o RCO responde "turma nao encontrada").
 */
export const DICIONARIO_CODDISC_PENDENTE: Record<string, number> = {
  "Ensino Religioso": 33,
  "Educação Ambiental": 89,
  // [MATRIZ-3A-RCO] (31/10/2026) do arquivo do RCO do Mario Braga (sem SAE no SERE)
  "Língua Espanhola": 3826,
  "Prática de Formação": 1269,
  // [PROJETO-DE-VIDA-3780] (05/11/2026) 3780 = Codigo Externo do RCO (arquivo do RCO do Iedo, cadastro do
  // Romario e tabela codigos_rco_disciplina SAE 594 -> 3780). Em 04/11 tinha entrado 594, que e o SAE.
  "Projeto de Vida": 3780,
};

export type OrigemCoddisc = "externo" | "sae" | "dicionario";

export function resolverCoddiscComOrigem(l: {
  disciplinaNome: string; codigoExternoRco: number | null; externoPeloSae: number | null;
}): { codigo: number; origem: OrigemCoddisc } | null {
  if (l.codigoExternoRco != null) return { codigo: Number(l.codigoExternoRco), origem: "externo" };
  if (l.externoPeloSae != null) return { codigo: Number(l.externoPeloSae), origem: "sae" };
  if (l.disciplinaNome in DICIONARIO_CODDISC_PENDENTE) return { codigo: DICIONARIO_CODDISC_PENDENTE[l.disciplinaNome], origem: "dicionario" };
  return null;
}

export function resolverCoddisc(l: {
  disciplinaNome: string; codigoExternoRco: number | null; externoPeloSae: number | null;
}): number | null {
  return resolverCoddiscComOrigem(l)?.codigo ?? null;
}
