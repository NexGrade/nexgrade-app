// [RASCUNHO-MELHORAR] (06/11/2026) Aulas de partida do "Melhorar": nas turmas que o rascunho tem, as aulas dele (com as
// trocas de aula e de professor feitas nele); nas outras, as oficiais. Funcao pura, testada em
// __tests__/rascunho-melhorar.test.ts. As aulas que nao vao ao motor (passthrough: assincrona so da turma,
// acompanhante) ficam de fora pela chave turma|disciplina|dia|aula; as do rascunho ganham id negativo para nao se
// confundirem com os ids das oficiais.
type AulaPartida = { id: number; turmaId: number; disciplinaId: number; diaSemana: number; numeroAula: number };

export const chaveAulaPartida = (h: { turmaId: number; disciplinaId: number; diaSemana: number; numeroAula: number }) =>
  `${h.turmaId}|${h.disciplinaId}|${h.diaSemana}|${h.numeroAula}`;

export function aulasDePartidaDoMelhorar<O extends AulaPartida, R extends AulaPartida>(
  oficiais: O[], doRascunho: R[], passthrough: AulaPartida[],
): Array<O | (R & { id: number })> {
  const turmasNoRascunho = new Set(doRascunho.map((h) => h.turmaId));
  const chavesPass = new Set(passthrough.map(chaveAulaPartida));
  return [
    ...oficiais.filter((h) => !turmasNoRascunho.has(h.turmaId)),
    ...doRascunho.filter((h) => !chavesPass.has(chaveAulaPartida(h))).map((h) => ({ ...h, id: -h.id })),
  ];
}

// [MELHORAR-PROFESSOR-NOVO] (17/11/2026) Caso do C.E. Andre Andreatta (17/11): o professor de uma disciplina foi trocado
// em Turmas (Catia -> Alex), mas as aulas ficaram com o anterior porque o novo ja tinha aula nesses horarios (a troca
// fora do rascunho so muda o vinculo quando ha choque). O Melhorar recusava ("ha aulas da grade oficial sem vinculo").
// Agora a aula que nao casa com nenhum vinculo passa para o professor do vinculo atual da mesma turma + disciplina
// (+ assincrona), quando ha UM so candidato: a linha do vinculo que nao tem nenhuma aula na grade de partida. A grade
// de partida e so dica para o motor, que tira o professor novo dos choques. Com dois ou mais candidatos (dupla com
// os dois professores trocados), nao adivinha: a aula continua sem vinculo e o Melhorar recusa como antes.
export type LinhaVinculoAtual = { turmaId: number; disciplinaId: number; professor: string; assincrona: boolean };
type AulaParaCasar = { turmaId: number; disciplinaId: number; professor: string | undefined; assincrona: boolean };

/** Indice da aula -> professor do vinculo atual, para as aulas que nao casam com nenhum vinculo. */
export function professorDoVinculoAtual(aulas: AulaParaCasar[], linhas: LinhaVinculoAtual[]): Map<number, string> {
  const grupo = (x: { turmaId: number; disciplinaId: number; assincrona: boolean }) => `${x.turmaId}|${x.disciplinaId}|${x.assincrona ? 1 : 0}`;
  const temLinha = new Set(linhas.map((l) => `${grupo(l)}|${l.professor}`));
  const casa = (a: AulaParaCasar) => a.professor != null && temLinha.has(`${grupo(a)}|${a.professor}`);
  const comAula = new Set(aulas.filter(casa).map((a) => `${grupo(a)}|${a.professor}`));
  const semAula = new Map<string, Set<string>>();
  for (const l of linhas) {
    if (comAula.has(`${grupo(l)}|${l.professor}`)) continue;
    const s = semAula.get(grupo(l)) ?? new Set<string>();
    s.add(l.professor);
    semAula.set(grupo(l), s);
  }
  const novo = new Map<number, string>();
  aulas.forEach((a, i) => {
    if (casa(a)) return;
    const candidatos = semAula.get(grupo(a));
    if (candidatos?.size === 1) novo.set(i, [...candidatos][0]!);
  });
  return novo;
}
