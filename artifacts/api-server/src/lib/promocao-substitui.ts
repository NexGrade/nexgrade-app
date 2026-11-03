// [PROMOVER-PROFESSOR-TROCADO] (03/11/2026) Quais aulas da grade OFICIAL o experimento substitui ao promover. Regra
// unica da promocao, da simulacao da promocao e do "fechar janela" (as tres tem que bater). Funcao pura (testada em
// __tests__/promocao-substitui.test.ts).
//  - Sai a aula do par turma+professor que esta no experimento ([FIX-PROMOVER-NAO-APAGAR-TUDO]: o experimento de
//    um professor so nao apaga as aulas dos outros professores da turma).
//  - Sai tambem a aula da mesma turma+disciplina do experimento cujo professor nao tem mais vinculo com ela na
//    turma (nem como apoio): a disciplina trocou de professor (ex.: substituto no lugar de quem saiu de licenca).
//    Antes essa aula ficava, e a turma ficava com a disciplina em dobro (bateria de simulacoes de 03/11).

import { inArray } from "drizzle-orm";

type AulaChave = { turmaId: number; disciplinaId: number; professorId: number | null };
type Vinculo = { turmaId: number; disciplinaId: number; professorId: number | null; professorApoioId: number | null };

export function regraDeSubstituicao(exp: AulaChave[], vinculos: Vinculo[]): (h: AulaChave) => boolean {
  const pares = new Set(exp.map((e) => `${e.turmaId}|${e.professorId}`));
  const discs = new Set(exp.map((e) => `${e.turmaId}|${e.disciplinaId}`));
  const vinculados = new Set(vinculos.flatMap((v) => [v.professorId, v.professorApoioId]
    .filter((p) => p != null).map((p) => `${v.turmaId}|${v.disciplinaId}|${p}`)));
  return (h) => pares.has(`${h.turmaId}|${h.professorId}`)
    || (discs.has(`${h.turmaId}|${h.disciplinaId}`) && !vinculados.has(`${h.turmaId}|${h.disciplinaId}|${h.professorId}`));
}

/** Vinculos (professor e apoio) das turmas, para `regraDeSubstituicao`. */
export async function vinculosDasTurmas(turmaIds: number[]): Promise<Vinculo[]> {
  if (!turmaIds.length) return [];
  const { db, turmaDisciplinasTable } = await import("@workspace/db"); // aqui dentro: o teste da regra roda sem banco
  return db.select({ turmaId: turmaDisciplinasTable.turmaId, disciplinaId: turmaDisciplinasTable.disciplinaId,
    professorId: turmaDisciplinasTable.professorId, professorApoioId: turmaDisciplinasTable.professorApoioId })
    .from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds));
}
