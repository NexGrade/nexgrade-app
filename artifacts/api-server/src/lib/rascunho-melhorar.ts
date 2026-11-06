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
