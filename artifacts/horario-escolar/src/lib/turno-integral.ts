// [TURNO-INTEGRAL-PROFESSOR] (26/10/2026) Mesma regra de artifacts/api-server/src/lib/turno-integral.ts
// (la tem os testes): cada aula do integral e ligada ao horario real do Matutino/Vespertino que
// mais se sobrepoe a ela no tempo. Na grade por PROFESSOR, a aula da turma integral aparece no
// turno e na linha reais (ex.: 3a da tarde do integral, 15:00, cai na 3a da tarde).
export const TURNO_INTEGRAL = "integral";

type SlotTempo = { turno?: string | null; nivelEnsino?: string | null; numeroAula: number; horaInicio?: string | null; duracaoMinutos?: number | null; letivo?: boolean | null };
export type MapaIntegral = Map<number, { turno: string; numeroAula: number }>;

const minutos = (h: string) => { const [a, b] = h.split(":").map(Number); return (a ?? 0) * 60 + (b ?? 0); };

export function mapaIntegralDosSlots(slots: SlotTempo[]): MapaIntegral {
  const mapa: MapaIntegral = new Map();
  const integral = slots.filter((s) => s.turno === TURNO_INTEGRAL && s.numeroAula >= 1 && s.horaInicio);
  if (!integral.length) return mapa;
  const candidatos: SlotTempo[] = [];
  for (const turno of ["matutino", "vespertino", "noturno"]) {
    const doTurno = slots.filter((s) => s.turno === turno && s.numeroAula >= 1 && s.letivo !== false && s.horaInicio);
    const medio = doTurno.filter((s) => s.nivelEnsino === "medio_tecnico");
    const fund = doTurno.filter((s) => s.nivelEnsino === "fundamental");
    candidatos.push(...(turno === "matutino" ? (medio.length ? medio : fund.length ? fund : doTurno) : doTurno));
  }
  for (const i of integral) {
    const ini = minutos(String(i.horaInicio));
    const fim = ini + (i.duracaoMinutos ?? 0);
    let melhor: SlotTempo | null = null;
    let sobreMax = 0;
    for (const c of candidatos) {
      const cIni = minutos(String(c.horaInicio));
      const sobre = Math.min(fim, cIni + (c.duracaoMinutos ?? 0)) - Math.max(ini, cIni);
      if (sobre > sobreMax) { sobreMax = sobre; melhor = c; }
    }
    if (melhor?.turno) mapa.set(i.numeroAula, { turno: melhor.turno, numeroAula: melhor.numeroAula });
  }
  return mapa;
}

/**
 * Aulas como o PROFESSOR as ve: aula de turma integral vai para o turno/linha reais
 * (turma.turno e numeroAula trocados). Guarda o numero original em `numeroAulaIntegral`
 * (editar a aula precisa dele).
 */
export function projetarAulasIntegral<A extends { numeroAula: number; turma?: { turno?: string | null } | null }>(
  aulas: A[] | undefined,
  mapa: MapaIntegral,
): A[] | undefined {
  if (!aulas || !mapa.size || !aulas.some((a) => a.turma?.turno === TURNO_INTEGRAL)) return aulas;
  return aulas.map((a) => {
    const real = a.turma?.turno === TURNO_INTEGRAL ? mapa.get(a.numeroAula) : undefined;
    if (!real) return a;
    return { ...a, numeroAula: real.numeroAula, numeroAulaIntegral: a.numeroAula, turma: { ...a.turma, turno: real.turno } };
  });
}
