/**
 * RNF-SEED-01: cálculo de Hora-Atividade institucional por turno.
 *
 * Os dois padrões oficiais confirmados (Resolução SEED n.º 7.200/2025,
 * Art. 11, §1º — ver chaves `seed_pr.padrao_20h` e `seed_pr.padrao_40h`
 * em `configuracoes`) têm a MESMA proporção HA-institucional/aulas:
 *
 *   20h: 15 aulas de regência + 5 HA institucional  → 5/15  = 1/3
 *   40h: 30 aulas de regência + 10 HA institucional → 10/30 = 1/3
 *
 * Como a proporção é sempre 1/3 nos dois regimes, dá pra calcular a HA
 * institucional de um professor olhando só as aulas que ele dá NESTA
 * escola — sem precisar saber o regime de contrato completo dele nem
 * quantas aulas tem em outras escolas. Isso também resolve o caso de
 * professor com carga dividida em várias escolas: cada escola calcula
 * a HA institucional dela de forma independente, e a soma bate com o
 * total institucional do regime completo (rateio proporcional).
 *
 * Arredondamento: sempre para CIMA. Confirmado com os únicos 3 valores
 * de HA que já vinham preenchidos nos relatórios reais da escola antes
 * deste cálculo existir (ex.: professor com 7 aulas em um turno = 3 HA
 * institucionais, não 2 — 7/3 = 2,33, arredonda pra 3).
 *
 * Importante: essa é a HA "institucional" (cumprida na escola, dentro
 * da grade). Existe também HA de "livre escolha" (4h no regime 20h, 8h
 * no regime 40h) que o professor cumpre fora da instituição e portanto
 * NÃO entra na grade nem neste cálculo.
 *
 * Regra de turno (Art. 11, §4º): quando o professor tem até 19 aulas
 * num turno (ver `seed_pr.hora_atividade_mesmo_turno_ate`), a HA dele
 * nesse turno deve ficar concentrada no MESMO turno das aulas — por
 * isso o cálculo é feito por turno, não por professor como um todo.
 */
export function calcularHoraAtividadeInstitucional(aulasNoTurno: number): number {
  if (!aulasNoTurno || aulasNoTurno <= 0) return 0;
  return Math.ceil(aulasNoTurno / 3);
}

/**
 * Aplica calcularHoraAtividadeInstitucional a um mapa turno→aulas,
 * retornando o mapa turno→HA institucional necessária.
 */
export function calcularHoraAtividadePorTurno(
  aulasPorTurno: Record<string, number>
): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const [turno, aulas] of Object.entries(aulasPorTurno)) {
    resultado[turno] = calcularHoraAtividadeInstitucional(aulas);
  }
  return resultado;
}
