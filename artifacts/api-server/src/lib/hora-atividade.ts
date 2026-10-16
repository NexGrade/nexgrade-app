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
 * isso o resultado final é por turno (ver `calcularHoraAtividadePorTurno`).
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
 * [HA-POR-TURNO] (15/10/2026, regra confirmada pela Simone) A tabela oficial e consultada
 * com as aulas de CADA TURNO, nao com o total da escola. Ex.: 14 aulas de manha + 8 a tarde
 * = 4 + 2 = 6 HA (antes: 22 aulas = 7 HA rateadas entre os turnos).
 */
export function calcularHoraAtividadePorTurno(
  aulasPorTurno: Record<string, number>
): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const [turno, aulas] of Object.entries(aulasPorTurno)) resultado[turno] = calcularHoraAtividadeInstitucional(aulas || 0);
  return resultado;
}

/** Total de HA do professor = soma da tabela consultada turno a turno. */
export function calcularHoraAtividadeTotal(aulasPorTurno: Record<string, number>): number {
  return Object.values(calcularHoraAtividadePorTurno(aulasPorTurno)).reduce((s, n) => s + n, 0);
}
