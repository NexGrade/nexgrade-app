import { describe, it, expect } from "vitest";
import { regraDeSubstituicao } from "../promocao-substitui";

// [PROMOVER-PROFESSOR-TROCADO] (03/11/2026) turma 1, disciplina 10 (Matematica), 11 (Arte), 12 (Recomposicao, codocencia)
describe("quais aulas oficiais o experimento substitui", () => {
  const vinculos = [
    { turmaId: 1, disciplinaId: 10, professorId: 200, professorApoioId: null }, // Matematica: agora o substituto (200)
    { turmaId: 1, disciplinaId: 11, professorId: 300, professorApoioId: null },
    { turmaId: 1, disciplinaId: 12, professorId: 400, professorApoioId: null },
    { turmaId: 1, disciplinaId: 12, professorId: 401, professorApoioId: null },
  ];

  it("disciplina que trocou de professor: a aula do antigo sai", () => {
    const substitui = regraDeSubstituicao([{ turmaId: 1, disciplinaId: 10, professorId: 200 }], vinculos);
    expect(substitui({ turmaId: 1, disciplinaId: 10, professorId: 100 })).toBe(true); // quem saiu de licenca
    expect(substitui({ turmaId: 1, disciplinaId: 11, professorId: 300 })).toBe(false); // Arte fica
  });

  it("experimento de um professor so nao apaga os outros (nem a codocencia)", () => {
    const substitui = regraDeSubstituicao([{ turmaId: 1, disciplinaId: 12, professorId: 400 }], vinculos);
    expect(substitui({ turmaId: 1, disciplinaId: 12, professorId: 400 })).toBe(true);
    expect(substitui({ turmaId: 1, disciplinaId: 12, professorId: 401 })).toBe(false); // o outro da dupla esta ligado
    expect(substitui({ turmaId: 1, disciplinaId: 10, professorId: 200 })).toBe(false); // Matematica, com o professor ligado, fica
    expect(substitui({ turmaId: 2, disciplinaId: 10, professorId: 100 })).toBe(false); // turma fora do experimento: nada sai
  });

  it("[PROMOVER-VINCULO-SEM-PROFESSOR] vinculo que ficou sem professor: a aula antiga sai, mesmo fora do experimento", () => {
    // 6TB, 03/11: Lingua Portuguesa (13) sem professor; o experimento regera a turma sem ela
    const semLP = [...vinculos, { turmaId: 1, disciplinaId: 13, professorId: null, professorApoioId: null }];
    const substitui = regraDeSubstituicao([{ turmaId: 1, disciplinaId: 11, professorId: 300 }], semLP);
    expect(substitui({ turmaId: 1, disciplinaId: 13, professorId: 500 })).toBe(true); // LP do professor antigo
    expect(substitui({ turmaId: 1, disciplinaId: 12, professorId: 400 })).toBe(false); // Recomposicao, ligada, fica
  });

  it("professor de apoio ligado nao sai", () => {
    const substitui = regraDeSubstituicao([{ turmaId: 1, disciplinaId: 11, professorId: 300 }],
      [...vinculos, { turmaId: 1, disciplinaId: 11, professorId: null, professorApoioId: 301 }]);
    expect(substitui({ turmaId: 1, disciplinaId: 11, professorId: 301 })).toBe(false);
  });
});
