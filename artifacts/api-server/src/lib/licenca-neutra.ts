// [LICENCA-SEM-DADO-SENSIVEL] (01/11/2026) A licenca guarda so o periodo e o substituto: nada de motivo nem tipo
// que revele saude (LGPD art. 5o, II e art. 6o, III: minimizacao). Tipo de lista fechada e neutra; licencas
// antigas (medica, maternidade, paternidade) aparecem como "afastamento" ate o script limpar o banco
// (scripts/limpar-licencas-sensiveis.ts). O comunicado automatico diz so o periodo e o substituto.

export const TIPOS_LICENCA = ["afastamento", "ferias", "capacitacao", "outros"] as const;
export type TipoLicenca = (typeof TIPOS_LICENCA)[number];

const ROTULO: Record<TipoLicenca, string> = { afastamento: "Afastado", ferias: "Férias", capacitacao: "Capacitação", outros: "Afastado" };

/** Tipo antigo ou desconhecido (ex.: "medica") vira "afastamento". */
export function tipoNeutro(tipo: string | null | undefined): TipoLicenca {
  return (TIPOS_LICENCA as readonly string[]).includes(tipo ?? "") ? (tipo as TipoLicenca) : "afastamento";
}

export function rotuloLicenca(tipo: string | null | undefined): string {
  return ROTULO[tipoNeutro(tipo)];
}

const dataBr = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

/** Comunicado automatico: so quem, o periodo e o substituto. */
export function comunicadoDaLicenca(professor: string, dataInicio: string, dataFim: string, substituto: string | null): { titulo: string; mensagem: string } {
  return {
    titulo: `Afastamento registrado — ${professor}`,
    mensagem: `Professor(a) ${professor} estará afastado(a) de ${dataBr(dataInicio)} a ${dataBr(dataFim)}.${substituto ? ` Substituto(a): ${substituto}.` : ""}`,
  };
}
