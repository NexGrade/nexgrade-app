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

/** Bloqueio para o MOTOR (heuristico e CP-SAT): bloqueio real + HA fixa. */
export function ehBloqueioParaMotor(d: {
  disponivel: boolean | null | undefined;
  horaAtividadeObrigatoria: boolean | null | undefined;
  motivo?: string | null;
}): boolean {
  return ehBloqueioReal(d) || ehHaFixa(d);
}