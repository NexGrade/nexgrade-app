// [CHOQUE-ANTES-DE-GRAVAR] (09/11/2026) Mesma regra da trava do banco (trava_conflito_professor, migracao manual
// 20261031-trava-conflitos-horario-real): o professor nao pode ter duas aulas (em turmas diferentes) que se sobrepoem no
// horario real (hora de inicio + duracao do horario_slots do turno/nivel da turma). Sem o horario cadastrado, vale o
// mesmo turno e o mesmo numero de aula. Aula assincrona nao conta.
// Serve para avisar ANTES de gravar (Aplicar rascunho, troca de professor em Turmas), com a lista completa, em vez de
// esperar o banco recusar com a primeira que achar. Funcao pura, testada em __tests__/choques-professor.test.ts.

export type SlotHora = { turno: string; nivelEnsino: string | null; numeroAula: number; horaInicio: string; duracaoMinutos: number };
export type TurmaHora = { id: number; nome: string; turno: string; nivelEnsino: string | null };
export type AulaHora = { turmaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona?: boolean | null };
export type Choque<A extends AulaHora = AulaHora> = { professorId: number; diaSemana: number; a: A; b: A };

const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Intervalo [inicio, fim) em minutos da aula, escolhendo o slot como a trava: mesmo nivel primeiro, depois medio_tecnico. */
export function montarHorarioReal(slots: SlotHora[], turmas: Map<number, TurmaHora>) {
  return (turmaId: number, numeroAula: number): [number, number] | null => {
    const t = turmas.get(turmaId);
    if (!t) return null;
    const cand = slots.filter((s) => s.turno === t.turno && s.numeroAula === numeroAula);
    if (!cand.length) return null;
    const nota = (s: SlotHora) => (s.nivelEnsino === t.nivelEnsino ? 2 : 0) + (s.nivelEnsino === "medio_tecnico" ? 1 : 0);
    const s = [...cand].sort((x, y) => nota(y) - nota(x))[0]!;
    const ini = minutos(s.horaInicio);
    return [ini, ini + s.duracaoMinutos];
  };
}

/**
 * Choques de professor entre as aulas. `importa` (opcional) limita aos choques em que pelo menos uma das duas aulas
 * importa (ex.: as que vao ser gravadas); sem ele, todos.
 */
export function choquesDeProfessor<A extends AulaHora>(
  aulas: A[], turmas: Map<number, TurmaHora>, slots: SlotHora[], importa?: (a: A) => boolean,
): Choque<A>[] {
  const horario = montarHorarioReal(slots, turmas);
  const grupos = new Map<string, A[]>();
  for (const a of aulas) {
    if (a.professorId == null || a.assincrona) continue;
    const k = `${a.professorId}|${a.diaSemana}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(a);
  }
  const choques: Choque<A>[] = [];
  for (const lista of grupos.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i]!, b = lista[j]!;
        if (a.turmaId === b.turmaId) continue;
        if (importa && !importa(a) && !importa(b)) continue;
        const ha = horario(a.turmaId, a.numeroAula), hb = horario(b.turmaId, b.numeroAula);
        const bate = ha && hb
          ? ha[0] < hb[1] && hb[0] < ha[1]
          : turmas.get(a.turmaId)?.turno === turmas.get(b.turmaId)?.turno && a.numeroAula === b.numeroAula;
        if (bate) choques.push({ professorId: a.professorId!, diaSemana: a.diaSemana, a, b });
      }
    }
  }
  return choques;
}

const DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** Texto curto de cada choque: "Fulano: quarta, 3ª aula na 9MF e 2ª aula na 1MA". */
export function descreverChoques(choques: Choque[], turmas: Map<number, TurmaHora>, nomeProfessor: (id: number) => string): string[] {
  const nomeT = (id: number) => turmas.get(id)?.nome ?? `turma #${id}`;
  return [...new Set(choques.map((c) =>
    `${nomeProfessor(c.professorId)}: ${DIA[c.diaSemana] ?? c.diaSemana}, ${c.a.numeroAula}ª aula na ${nomeT(c.a.turmaId)} e ${c.b.numeroAula}ª aula na ${nomeT(c.b.turmaId)}`))];
}

/** A mensagem da trava do banco ("IMPOSSÍVEL SALVAR: ..."), se o erro veio dela; senao null. */
export function mensagemDaTravaDeChoque(err: unknown): string | null {
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string") {
      const m = msg.match(/IMPOSS[IÍ]VEL SALVAR:[^\n]*/);
      if (m) return m[0].trim();
    }
  }
  return null;
}
