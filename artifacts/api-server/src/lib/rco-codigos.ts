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
