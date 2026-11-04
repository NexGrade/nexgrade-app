/**
 * [REGRA-BLOQUEIO-REAL] Unica fonte da verdade sobre o que e bloqueio de professor.
 *
 * Bloqueio real = indisponibilidade de verdade (tracos do sistema anterior, PAEE,
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

/**
 * [HA-FIXA] HA fixa: hora-atividade definida manualmente para um caso
 * excepcional (reuniao fixa de area, acordo com a direcao...). Continua
 * sendo HA em tudo (PDF, capacidade, recalculo, conflitos), mas o MOTOR a
 * trata como bloqueio: nunca coloca aula nesse horario.
 * A marca fica no motivo da linha de disponibilidade.
 */
export const MOTIVO_HA_FIXA = "HA fixa (definida manualmente)";

export function ehHaFixa(d: {
  horaAtividadeObrigatoria: boolean | null | undefined;
  motivo?: string | null;
}): boolean {
  return !!d.horaAtividadeObrigatoria && (d.motivo ?? "").startsWith("HA fixa");
}

/**
 * [HA-PROBATORIO-BLOQUEIA] (04/11/2026) HA do estagio probatorio (abono PROB): o recalculo e o "HA no buraco" nunca a
 * movem, mas o motor nao a via e podia pôr aula em cima; depois o recalculo deixava de preserva-la (aula no horario) e
 * ela sumia sem aviso. Agora o motor a trata como a HA fixa. So o probatorio: HA "presa" por outro motivo continua fora
 * do motor (tratar HA como bloqueio derrubou a coordenacao em 23-24/09, ver acima).
 */
export function ehHaProbatorio(d: { horaAtividadeObrigatoria: boolean | null | undefined; motivo?: string | null }): boolean {
  return !!d.horaAtividadeObrigatoria && /probat/i.test(d.motivo ?? "");
}

/** Bloqueio para o MOTOR (heuristico e CP-SAT): bloqueio real + HA fixa + HA de probatorio. */
export function ehBloqueioParaMotor(d: {
  disponivel: boolean | null | undefined;
  horaAtividadeObrigatoria: boolean | null | undefined;
  motivo?: string | null;
}): boolean {
  return ehBloqueioReal(d) || ehHaFixa(d) || ehHaProbatorio(d); // [HA-PROBATORIO-BLOQUEIA]
}
