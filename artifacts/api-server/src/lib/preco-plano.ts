// [PRECO-POR-TURMA] (15/10/2026) Valor da assinatura de um plano para uma escola.
//  - cobranca "fixa": precoMensal / precoAnual do plano (como antes);
//  - cobranca "por_turma": turmas cadastradas da escola x preco por turma POR ANO. Sem valor minimo.
// [PRECO-MENSAL-ANUAL] (21/10/2026) cada opcao tem o proprio preco por turma por ano:
//  - anual : precoPorTurmaAnual, cobrado a vista;
//  - mensal: precoPorTurmaParcelado, dividido em 12 parcelas, com a parcela
//    ARREDONDADA PARA CIMA ao real inteiro (ex.: 26 x R$ 32,00 = R$ 832,00 -> 12x de R$ 70,00).
//    Se precoPorTurmaParcelado estiver vazio, o mensal usa precoPorTurmaAnual (como antes).
export type PlanoPreco = {
  nome: string;
  precoMensal: number;
  precoAnual: number | null;
  cobranca?: string | null;
  precoPorTurmaAnual?: number | null;
  precoPorTurmaParcelado?: number | null;
};
export type Periodicidade = "mensal" | "anual";

export function ehPorTurma(p: PlanoPreco): boolean {
  return p.cobranca === "por_turma" && (p.precoPorTurmaAnual ?? 0) > 0;
}

/** Plano que gera cobranca (usado para liberar recursos de planos pagos). */
export function ehPlanoPago(p: PlanoPreco): boolean {
  return p.precoMensal > 0 || ehPorTurma(p);
}

/** Preco de UMA turma por ANO na opcao escolhida (centavos). */
export function precoTurmaAno(p: PlanoPreco, periodicidade: Periodicidade): number {
  const anual = p.precoPorTurmaAnual ?? 0;
  if (periodicidade === "anual") return anual;
  const parcelado = p.precoPorTurmaParcelado ?? 0;
  return parcelado > 0 ? parcelado : anual;
}

/** Parcela do plano mensal: total do ano / 12, arredondada para cima ao real inteiro (centavos). */
export function parcelaMensal(totalAnoCentavos: number): number {
  return Math.ceil(totalAnoCentavos / 1200) * 100;
}

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Valor em reais (2 casas) e uma descricao legivel para a cobranca. */
export function valorAssinatura(p: PlanoPreco, totalTurmas: number, periodicidade: Periodicidade): { valorReais: number; descricao: string } {
  if (ehPorTurma(p)) {
    const porTurmaAno = precoTurmaAno(p, periodicidade);
    const totalAno = totalTurmas * porTurmaAno;
    const centavos = periodicidade === "anual" ? totalAno : parcelaMensal(totalAno);
    const base = `${totalTurmas} turma${totalTurmas === 1 ? "" : "s"} x ${reais(porTurmaAno)}/ano`;
    return {
      valorReais: centavos / 100,
      descricao: periodicidade === "anual" ? `${base} (anual)` : `${base}, em 12x de ${reais(centavos)}`,
    };
  }
  const centavos = periodicidade === "anual" ? (p.precoAnual ?? p.precoMensal * 12) : p.precoMensal;
  return { valorReais: centavos / 100, descricao: periodicidade === "anual" ? "anual" : "mensal" };
}
