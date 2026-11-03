// [PROMOVER-PROFESSOR-TROCADO] (03/11/2026) Quais aulas da grade OFICIAL o experimento substitui ao promover. Regra
// unica da promocao, da simulacao da promocao e do "fechar janela" (as tres tem que bater). Funcao pura (testada em
// __tests__/promocao-substitui.test.ts).
//  - Sai a aula do par turma+professor que esta no experimento ([FIX-PROMOVER-NAO-APAGAR-TUDO]: o experimento de
//    um professor so nao apaga as aulas dos outros professores da turma).
//  - Sai tambem a aula da mesma turma+disciplina do experimento cujo professor nao tem mais vinculo com ela na
//    turma (nem como apoio): a disciplina trocou de professor (ex.: substituto no lugar de quem saiu de licenca).
//    Antes essa aula ficava, e a turma ficava com a disciplina em dobro (bateria de simulacoes de 03/11).
//  - [PROMOVER-VINCULO-SEM-PROFESSOR] e, nas turmas do experimento, a aula de qualquer disciplina cujo professor nao
//    tem mais vinculo com ela, mesmo que a disciplina nao esteja no experimento: o vinculo ficou sem professor e a
//    geracao a deixou de fora. Antes ela ficava na oficial, em cima das aulas novas da turma (6TB, 03/11: LP sobre
//    Matematica e Ed. Fisica, e o professor antigo "em 2 turmas" ao mesmo tempo).
//    O vinculo sem professor gravado que a geracao resolve pelo nome ("Fulano (6TB)", resolverProfessor em
//    horarios.ts) conta como vinculo desse professor: a aula dele nao sai.

import { inArray, like } from "drizzle-orm";

type AulaChave = { turmaId: number; disciplinaId: number; professorId: number | null };
type Vinculo = { turmaId: number; disciplinaId: number; professorId: number | null; professorApoioId: number | null };

export function regraDeSubstituicao(exp: AulaChave[], vinculos: Vinculo[]): (h: AulaChave) => boolean {
  const pares = new Set(exp.map((e) => `${e.turmaId}|${e.professorId}`));
  const turmas = new Set(exp.map((e) => e.turmaId));
  const vinculados = new Set(vinculos.flatMap((v) => [v.professorId, v.professorApoioId]
    .filter((p) => p != null).map((p) => `${v.turmaId}|${v.disciplinaId}|${p}`)));
  return (h) => pares.has(`${h.turmaId}|${h.professorId}`)
    || (turmas.has(h.turmaId) && !vinculados.has(`${h.turmaId}|${h.disciplinaId}|${h.professorId}`));
}

/** Vinculos (professor e apoio) das turmas, para `regraDeSubstituicao`. */
export async function vinculosDasTurmas(turmaIds: number[]): Promise<Vinculo[]> {
  if (!turmaIds.length) return [];
  // aqui dentro: o teste da regra roda sem banco
  const { db, turmaDisciplinasTable, turmasTable, professoresTable, professorDisciplinasTable } = await import("@workspace/db");
  const vinculos: Vinculo[] = await db.select({ turmaId: turmaDisciplinasTable.turmaId, disciplinaId: turmaDisciplinasTable.disciplinaId,
    professorId: turmaDisciplinasTable.professorId, professorApoioId: turmaDisciplinasTable.professorApoioId })
    .from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds));
  const semProfessor = vinculos.filter((v) => v.professorId == null);
  if (!semProfessor.length) return vinculos;
  // mesma regra do resolverProfessor do payload: habilitado na disciplina e com "(turma)" no nome
  const [turmas, comTurmaNoNome, habilitacoes] = await Promise.all([
    db.select({ id: turmasTable.id, nome: turmasTable.nome, escolaId: turmasTable.escolaId }).from(turmasTable).where(inArray(turmasTable.id, turmaIds)),
    db.select({ id: professoresTable.id, nome: professoresTable.nome, escolaId: professoresTable.escolaId }).from(professoresTable).where(like(professoresTable.nome, "%(%)%")),
    db.select().from(professorDisciplinasTable),
  ]);
  const turmaPorId = new Map(turmas.map((t) => [t.id, t]));
  const habilitado = new Set(habilitacoes.map((h) => `${h.professorId}|${h.disciplinaId}`));
  for (const v of semProfessor) {
    const t = turmaPorId.get(v.turmaId);
    const p = t && comTurmaNoNome.find((x) => x.escolaId === t.escolaId && habilitado.has(`${x.id}|${v.disciplinaId}`) && x.nome.includes(`(${t.nome})`));
    if (p) vinculos.push({ ...v, professorId: p.id });
  }
  return vinculos;
}
