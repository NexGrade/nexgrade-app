// [PRECO-POR-TURMA] (15/10/2026) Valor da assinatura de um plano para uma escola.
//  - cobranca "fixa": precoMensal / precoAnual do plano (como antes);
//  - cobranca "por_turma": precoPorTurmaAnual x turmas cadastradas da escola.
//    Anual = a vista; mensal = o valor anual dividido em 12 parcelas. Sem valor minimo.
export type PlanoPreco = {
  nome: string;
  precoMensal: number;
  precoAnual: number | null;
  cobranca?: string | null;
  precoPorTurmaAnual?: number | null;
};
export type Periodicidade = "mensal" | "anual";

export function ehPorTurma(p: PlanoPreco): boolean {
  return p.cobranca === "por_turma" && (p.precoPorTurmaAnual ?? 0) > 0;
}

/** Plano que gera cobranca (usado para liberar recursos de planos pagos). */
export function ehPlanoPago(p: PlanoPreco): boolean {
  return p.precoMensal > 0 || ehPorTurma(p);
}

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Valor em reais (2 casas) e uma descricao legivel para a cobranca. */
export function valorAssinatura(p: PlanoPreco, totalTurmas: number, periodicidade: Periodicidade): { valorReais: number; descricao: string } {
  if (ehPorTurma(p)) {
    const anualCentavos = totalTurmas * (p.precoPorTurmaAnual ?? 0);
    const centavos = periodicidade === "anual" ? anualCentavos : Math.round(anualCentavos / 12);
    const base = `${totalTurmas} turma${totalTurmas === 1 ? "" : "s"} x ${reais(p.precoPorTurmaAnual ?? 0)}/ano`;
    return {
      valorReais: centavos / 100,
      descricao: periodicidade === "anual" ? `${base} (anual)` : `${base}, em 12x de ${reais(centavos)}`,
    };
  }
  const centavos = periodicidade === "anual" ? (p.precoAnual ?? p.precoMensal * 12) : p.precoMensal;
  return { valorReais: centavos / 100, descricao: periodicidade === "anual" ? "anual" : "mensal" };
}
