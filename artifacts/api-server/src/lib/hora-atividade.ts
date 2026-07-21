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
 * Arredondamento: sempre para CIMA — mas só UMA VEZ, no total geral do
 * professor, não turno por turno. Fazer cada turno arredondar pra cima
 * de forma independente infla o total: 30 aulas divididas em 20 de
 * manhã + 10 à tarde viraria ceil(20/3)=7 + ceil(10/3)=4 = 11 HA, em
 * vez das 10 esperadas pra 30 aulas (ceil(30/3)=10). A correção usa o
 * método dos maiores restos (Hare-Niemeyer): calcula o total geral
 * (arredondado pra cima uma única vez) e distribui esse total entre os
 * turnos proporcionalmente às aulas de cada um, sem que a soma das
 * partes ultrapasse o total. Confirmado com os únicos 3 valores de HA
 * que já vinham preenchidos nos relatórios reais da escola antes deste
 * cálculo existir (ex.: professor com 7 aulas em um turno = 3 HA
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
 * isso o resultado final ainda é por turno, mesmo calculando o total
 * geral primeiro.
 */
export function calcularHoraAtividadeInstitucional(aulasNoTurno: number): number {
  if (!aulasNoTurno || aulasNoTurno <= 0) return 0;
  return Math.ceil(aulasNoTurno / 3);
}

/**
 * Calcula o total geral de HA institucional (arredondado pra cima uma
 * única vez) e distribui esse total entre os turnos, proporcionalmente
 * às aulas de cada um, pelo método dos maiores restos -- garante que a
 * soma das partes seja exatamente igual ao total geral, sem inflar por
 * arredondamento duplicado.
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

  const exigidoTotal = Math.ceil(totalAulas / 3);

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
