// [HA-INCOMPLETA-REFAZ] (04/11/2026) Na promocao (e na simulacao, que imita a promocao), quem nao teve aula mexida
// fica com a HA de hoje ([HA-SO-QUEM-MUDOU]). Se a HA de hoje estiver INCOMPLETA (menos HA no turno do que o recalculo
// poe), o professor ficava assim para sempre: o recalculo dava a HA, mas a de hoje voltava por cima. Caso real:
// Alexandre Moreira (Demonstracao, 04/11), 10 aulas so de manha e nenhuma HA; a janela da quarta nunca fechava e o PDF
// da previa saia sem HA. Agora quem tem menos HA do que a regra num turno do experimento tem a HA refeita, como quem
// teve aula mexida. Vale tambem para HA A MAIS do que a regra (ex.: Giovana Moreira, 7 HA na tarde onde a regra da 5):
// a quantidade tem que ser a da regra. Quem tem a quantidade certa continua com a de hoje (inclusive a importada).

export interface MarcaTurno { professorId: number; turno: string | null }
export interface LinhaHA { professorId: number; turno: string | null; horaAtividadeObrigatoria: boolean }

export function professoresComHAIncompleta(haIdeal: MarcaTurno[], haHoje: LinhaHA[], turnos: string[]): Set<number> {
  const alvo = new Set(turnos);
  const contar = (rows: MarcaTurno[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.turno && alvo.has(r.turno)) m.set(`${r.professorId}|${r.turno}`, (m.get(`${r.professorId}|${r.turno}`) ?? 0) + 1);
    return m;
  };
  const ideal = contar(haIdeal);
  const hoje = contar(haHoje.filter((d) => d.horaAtividadeObrigatoria));
  const r = new Set<number>();
  for (const k of new Set([...ideal.keys(), ...hoje.keys()])) if ((hoje.get(k) ?? 0) !== (ideal.get(k) ?? 0)) r.add(Number(k.split("|")[0]));
  return r;
}
