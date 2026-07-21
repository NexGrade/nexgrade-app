/**
 * RNF-SEED-01: cálculo de Hora-Atividade institucional por turno.
 *
 * [CORRIGIDO] Antes usava uma fórmula aproximada (`ceil(aulas/3)`),
 * assumindo que a proporção 1/3 valia uniformemente em qualquer ponto.
 * Isso é falso: a SEED-PR publica uma TABELA oficial de conversão
 * "Hora-aula Regência → Hora-atividade" (educacao.pr.gov.br, página
 * "Jornada de Trabalho com horas-atividade"), com saltos irregulares
 * que não seguem uma fórmula matemática simples -- só bate 1/3 nos
 * extremos do regime de 40h (30 aulas = 10 HA). Em 17 dos 30 pontos da
 * tabela, `ceil(aulas/3)` pedia HA A MAIS do que o oficial (ex.: 13
 * aulas = 4 HA de verdade, não 5; 8 aulas = 2 HA, não 3) -- isso
 * inflava artificialmente os alertas de "HA insuficiente" no sistema.
 * Agora a tabela oficial é usada diretamente, por consulta exata.
 *
 * Importante: essa é a HA "institucional" (cumprida na escola, dentro
 * da grade). Existe também HA de "livre escolha" (fora da tabela, fora
 * da instituição) que NÃO entra na grade nem neste cálculo.
 *
 * Regra de turno (Art. 11, §4º): quando o professor tem até 19 aulas
 * num turno (ver `seed_pr.hora_atividade_mesmo_turno_ate`), a HA dele
 * nesse turno deve ficar concentrada no MESMO turno das aulas — por
 * isso o resultado final ainda é por turno, mesmo calculando o total
 * geral primeiro (ver `calcularHoraAtividadePorTurno`).
 */
const TABELA_OFICIAL_HA: readonly number[] = [
  0, // 0 aulas
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3,   // 1–10
  4, 4, 4, 4, 5, 5, 5, 6, 6, 6,   // 11–20
  7, 7, 7, 8, 8, 8, 9, 9, 10, 10, // 21–30
];

/**
 * Consulta a tabela oficial pra um número de aulas (0–30, regime de
 * regência semanal). Acima de 30 (fora da tabela publicada) usa a
 * proporção 1/3 confirmada nos extremos como fallback, pra nunca
 * travar o cálculo -- mas isso não deveria acontecer na prática, já
 * que 30 é o teto de aulas do regime de 40h.
 */
export function calcularHoraAtividadeInstitucional(aulasNoTurno: number): number {
  if (!aulasNoTurno || aulasNoTurno <= 0) return 0;
  if (aulasNoTurno <= 30) return TABELA_OFICIAL_HA[Math.round(aulasNoTurno)]!;
  return Math.ceil(aulasNoTurno / 3);
}

/**
 * Calcula o total geral de HA institucional (via tabela oficial,
 * consultada uma única vez pro total) e distribui esse total entre os
 * turnos, proporcionalmente às aulas de cada um, pelo método dos
 * maiores restos -- garante que a soma das partes seja exatamente
 * igual ao total geral, sem inflar por arredondamento duplicado.
 */
export function calcularHoraAtividadePorTurno(
  aulasPorTurno: Record<string, number>
): Record<string, number> {
  const turnos = Object.keys(aulasPorTurno);
  const totalAulas = turnos.reduce((soma, t) => soma + (aulasPorTurno[t] || 0), 0);

  if (totalAulas <= 0) {
    const zeros: Record<string, number> = {};
    turnos.forEach((t) => (zeros[t] = 0));
    return zeros;
  }

  const exigidoTotal = calcularHoraAtividadeInstitucional(totalAulas);

  const partes = turnos.map((turno) => {
    const aulas = aulasPorTurno[turno] || 0;
    const proporcional = (aulas / totalAulas) * exigidoTotal;
    return { turno, base: Math.floor(proporcional), resto: proporcional - Math.floor(proporcional) };
  });

  let alocado = partes.reduce((soma, p) => soma + p.base, 0);
  let faltam = exigidoTotal - alocado;

  // Distribui o que sobrou (pra fechar o total exato) pros turnos com
  // maior resto fracionário -- método padrão de rateio (Hare-Niemeyer).
  const ordenadoPorResto = [...partes].sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < ordenadoPorResto.length && faltam > 0; i++) {
    ordenadoPorResto[i]!.base += 1;
    faltam--;
  }

  const resultado: Record<string, number> = {};
  partes.forEach((p) => (resultado[p.turno] = p.base));
  return resultado;
}
