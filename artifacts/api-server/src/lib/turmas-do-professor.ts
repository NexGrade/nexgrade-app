// [TURMAS-DO-PROFESSOR] (11/11/2026, pedido da dona depois do video tutorial) lista das turmas em que o
// professor da aula, para o quadro "Turmas em que dá aula" da tela Editar Professor(a).
// Uma linha por turma e disciplina, com as aulas por semana de dois lugares:
// - o vinculo (turma_disciplinas): titular (professor_id) ou co-docencia (professor_apoio_id);
// - a grade oficial (horarios): quantas aulas dele estao de fato na grade.
// Quando os dois divergem, a tela mostra os dois numeros.

export type VinculoTurmaDisciplina = {
  turmaId: number;
  disciplinaId: number;
  professorId: number | null;
  professorApoioId: number | null;
  cargaHorariaSemanalOverride: number | null;
  grupoTrio: string | null;
};

export type TurmaInfo = { id: number; nome: string; turno: string; matrizCurricularId: number | null };
export type DisciplinaInfo = { id: number; nome: string; cargaSemanal: number | null };

export type TurmaDoProfessor = {
  turmaId: number;
  turma: string;
  turno: string;
  disciplinaId: number;
  disciplina: string;
  /** aulas por semana pelo vinculo; null quando a aula esta na grade mas o vinculo nao e dele */
  aulasVinculo: number | null;
  /** aulas dele na grade oficial (horarios) */
  aulasGrade: number;
  /** "apoio" = co-docencia (segundo professor da mesma aula) */
  papel: "titular" | "apoio";
  /** disciplina de docencia por trio */
  trio: boolean;
};

const ORDEM_TURNO: Record<string, number> = { matutino: 0, vespertino: 1, integral: 2, noturno: 3 };

export function montarTurmasDoProfessor(params: {
  professorId: number;
  nomeProfessor: string;
  /** disciplinas que o professor esta habilitado a dar (professor_disciplinas) */
  disciplinasHabilitadas: Set<number>;
  vinculos: VinculoTurmaDisciplina[];
  /** uma entrada por aula dele na grade oficial */
  aulasNaGrade: { turmaId: number; disciplinaId: number }[];
  turmas: Map<number, TurmaInfo>;
  disciplinas: Map<number, DisciplinaInfo>;
  /** aulas por semana da matriz curricular, chave `${matrizId}-${disciplinaId}` */
  cargaMatriz: Map<string, number>;
}): TurmaDoProfessor[] {
  const { professorId, nomeProfessor, disciplinasHabilitadas, vinculos, aulasNaGrade, turmas, disciplinas, cargaMatriz } = params;
  const linhas = new Map<string, TurmaDoProfessor>();
  const chave = (turmaId: number, disciplinaId: number) => `${turmaId}-${disciplinaId}`;
  const nova = (turmaId: number, disciplinaId: number): TurmaDoProfessor | null => {
    const turma = turmas.get(turmaId);
    if (!turma) return null;
    return {
      turmaId, turma: turma.nome, turno: turma.turno, disciplinaId,
      disciplina: disciplinas.get(disciplinaId)?.nome ?? `Disciplina ${disciplinaId}`,
      aulasVinculo: null, aulasGrade: 0, papel: "titular", trio: false,
    };
  };

  for (const v of vinculos) {
    const turma = turmas.get(v.turmaId);
    if (!turma) continue;
    // mesma regra do resolverProfessor (horarios.ts / capacidade-professor.ts): sem professor no vinculo,
    // vale o habilitado na disciplina cujo nome traz a turma entre parenteses, ex.: "Ana (1ºA)"
    const titular = v.professorId === professorId
      || (v.professorId == null && disciplinasHabilitadas.has(v.disciplinaId) && nomeProfessor.includes(`(${turma.nome})`));
    const apoio = !titular && v.professorApoioId === professorId;
    if (!titular && !apoio) continue;
    const linha = nova(v.turmaId, v.disciplinaId);
    if (!linha) continue;
    linha.aulasVinculo = v.cargaHorariaSemanalOverride
      ?? (turma.matrizCurricularId != null ? cargaMatriz.get(`${turma.matrizCurricularId}-${v.disciplinaId}`) : undefined)
      ?? disciplinas.get(v.disciplinaId)?.cargaSemanal ?? 0;
    linha.papel = apoio ? "apoio" : "titular";
    linha.trio = !!v.grupoTrio;
    linhas.set(chave(v.turmaId, v.disciplinaId), linha);
  }

  for (const a of aulasNaGrade) {
    const k = chave(a.turmaId, a.disciplinaId);
    let linha = linhas.get(k);
    if (!linha) {
      const n = nova(a.turmaId, a.disciplinaId);
      if (!n) continue;
      linha = n;
      linhas.set(k, linha);
    }
    linha.aulasGrade += 1;
  }

  return [...linhas.values()].sort((a, b) =>
    (ORDEM_TURNO[a.turno] ?? 9) - (ORDEM_TURNO[b.turno] ?? 9)
    || a.turma.localeCompare(b.turma, "pt-BR", { numeric: true })
    || a.disciplina.localeCompare(b.disciplina, "pt-BR"));
}
