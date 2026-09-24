/**
 * [REGRA-BLOQUEIO-REAL] Unica fonte da verdade sobre o que e bloqueio de professor.
 *
 * Bloqueio real = indisponibilidade de verdade (tracos do Urania, PAEE,
 * bloqueios manuais). A hora-atividade (HA) NUNCA e bloqueio: ela e
 * calculada DEPOIS da grade (recalcularHoraAtividade) e gravada com
 * disponivel=true + horaAtividadeObrigatoria=true.
 *
 * Tratar HA como bloqueio na geracao ja derrubou a coordenacao do
 * CP-SAT (23-24/09/2026): a HA da grade oficial travava os professores-ponte.
 *
 * NAO reescreva este filtro em outro lugar -- importe esta funcao.
 */
export function ehBloqueioReal(d: {
  disponivel: boolean | null | undefined;
  horaAtividadeObrigatoria: boolean | null | undefined;
}): boolean {
  return !d.disponivel && !d.horaAtividadeObrigatoria;
}