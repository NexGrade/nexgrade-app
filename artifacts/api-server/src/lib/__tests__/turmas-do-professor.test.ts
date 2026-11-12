import { describe, it, expect } from "vitest";
import { montarTurmasDoProfessor, type VinculoTurmaDisciplina } from "../turmas-do-professor";
import { ehLeituraDaEquipe, ehLeituraSomenteAdmin } from "../permissao";

const turmas = new Map([
  [1, { id: 1, nome: "6ºA", turno: "matutino", matrizCurricularId: 10 }],
  [2, { id: 2, nome: "1ªB", turno: "vespertino", matrizCurricularId: null }],
  [3, { id: 3, nome: "2ºC", turno: "noturno", matrizCurricularId: null }],
]);
const disciplinas = new Map([
  [100, { id: 100, nome: "Matemática", cargaSemanal: 4 }],
  [101, { id: 101, nome: "Recomposição de Matemática", cargaSemanal: 2 }],
  [102, { id: 102, nome: "Projeto de Vida", cargaSemanal: 2 }],
  [103, { id: 103, nome: "Arte", cargaSemanal: 2 }],
]);
const v = (x: Partial<VinculoTurmaDisciplina> & { turmaId: number; disciplinaId: number }): VinculoTurmaDisciplina => ({
  professorId: null, professorApoioId: null, cargaHorariaSemanalOverride: null, grupoTrio: null, ...x,
});

describe("turmas em que o professor dá aula [TURMAS-DO-PROFESSOR]", () => {
  const base = {
    professorId: 7, nomeProfessor: "Ana", disciplinasHabilitadas: new Set([100]),
    turmas, disciplinas, cargaMatriz: new Map([["10-100", 5]]),
  };

  it("uma linha por turma e disciplina, com vínculo e grade, titular, apoio e trio", () => {
    const r = montarTurmasDoProfessor({
      ...base,
      vinculos: [
        v({ turmaId: 1, disciplinaId: 100, professorId: 7 }), // matriz: 5
        v({ turmaId: 1, disciplinaId: 101, professorId: 8, professorApoioId: 7 }), // co-docência
        v({ turmaId: 2, disciplinaId: 102, professorId: 7, grupoTrio: "trio1", cargaHorariaSemanalOverride: 3 }),
        v({ turmaId: 2, disciplinaId: 103, professorId: 9 }), // de outro professor
      ],
      aulasNaGrade: [
        ...Array(5).fill({ turmaId: 1, disciplinaId: 100 }),
        ...Array(2).fill({ turmaId: 1, disciplinaId: 101 }),
        ...Array(2).fill({ turmaId: 2, disciplinaId: 102 }), // diverge do vínculo (3)
      ],
    });
    expect(r).toEqual([
      { turmaId: 1, turma: "6ºA", turno: "matutino", disciplinaId: 100, disciplina: "Matemática", aulasVinculo: 5, aulasGrade: 5, papel: "titular", trio: false },
      { turmaId: 1, turma: "6ºA", turno: "matutino", disciplinaId: 101, disciplina: "Recomposição de Matemática", aulasVinculo: 2, aulasGrade: 2, papel: "apoio", trio: false },
      { turmaId: 2, turma: "1ªB", turno: "vespertino", disciplinaId: 102, disciplina: "Projeto de Vida", aulasVinculo: 3, aulasGrade: 2, papel: "titular", trio: true },
    ]);
  });

  it("aula na grade sem vínculo dele aparece com vínculo nulo; vínculo sem grade aparece com 0 na grade", () => {
    const r = montarTurmasDoProfessor({
      ...base,
      vinculos: [v({ turmaId: 2, disciplinaId: 103, professorId: 7 })],
      aulasNaGrade: [{ turmaId: 3, disciplinaId: 100 }],
    });
    expect(r.map((x) => [x.turma, x.aulasVinculo, x.aulasGrade])).toEqual([["1ªB", 2, 0], ["2ºC", null, 1]]);
  });

  it("vínculo sem professor vale para o habilitado com a turma no nome, como no motor", () => {
    const r = montarTurmasDoProfessor({
      ...base, nomeProfessor: "Ana (6ºA)",
      vinculos: [v({ turmaId: 1, disciplinaId: 100 }), v({ turmaId: 1, disciplinaId: 103 })],
      aulasNaGrade: [],
    });
    expect(r.map((x) => x.disciplina)).toEqual(["Matemática"]); // Arte: não habilitada
  });

  it("a rota de carga segue como consulta comum (dados da grade, não da equipe)", () => {
    expect(ehLeituraSomenteAdmin("/professores/7/carga")).toBe(false);
    expect(ehLeituraDaEquipe("/professores/7/carga")).toBe(false);
  });
});
