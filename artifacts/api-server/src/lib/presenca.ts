// [PRESENCA-PEDAGOGIA] (28/10/2026) Regras puras da lista de presenca dos professores e da tela
// "Onde esta agora" (sem banco; testadas em __tests__/presenca.test.ts). A rota (routes/pedagogia.ts)
// carrega a grade oficial do dia, as reservas e as marcacoes e chama estas funcoes.
export const STATUS = ["presente", "falta", "atraso", "substituido"] as const;
export type Status = (typeof STATUS)[number];
export const ROTULO_STATUS: Record<Status, string> = { presente: "Presente", falta: "Falta", atraso: "Atraso", substituido: "Substituído" };
export const ROTULO_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
export const TURNOS_DIA = ["matutino", "vespertino", "noturno"] as const;

export type Marca = { status: Status; substitutoId: number | null; substitutoNome: string | null; observacao: string | null };
/** [PRESENCA-ASS-HA] (06/11/2026) a lista mostra tambem as assincronas e a hora-atividade do professor. */
export type TipoAula = "aula" | "assincrona" | "ha";
/** [PRESENCA-HIBRIDA] (06/11/2026) aula de trio com revezamento (Hibrida): presencial ou suporte na semana da data. */
export type SituacaoTrio = "presencial" | "suporte";
export type AulaDoDia = {
  numeroAula: number; hora: string; fim: string;
  tipo: TipoAula;
  trio: SituacaoTrio | null;
  turmas: string; disciplinas: string; sala: string;
  marca: Marca | null;
};
/** [PRESENCA-OBS-GERAL] (06/11/2026) observacao geral do professor no dia/turno (antes era por aula). */
export type ProfessorDoDia = { professorId: number; nome: string; licenca: string | null; observacao: string | null; aulas: AulaDoDia[] };

export type SlotEsquema = { turno: string; nivelEnsino: string | null; numeroAula: number; horaInicio: string; duracaoMinutos: number; letivo: boolean };

/** "07:30:00" -> 450 */
export function minutosDe(hora: string): number {
  const [h, m] = String(hora).slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Slot do esquema que vale para a turma (no matutino o Fundamental e o Medio/Tecnico tem horarios proprios). */
export function slotDaTurma(slots: SlotEsquema[], turno: string, nivelEnsino: string | null | undefined, numeroAula: number): SlotEsquema | undefined {
  const doTurno = slots.filter((s) => s.turno === turno && s.numeroAula === numeroAula);
  if (turno !== "matutino") return doTurno[0];
  return doTurno.find((s) => s.nivelEnsino === (nivelEnsino ?? "medio_tecnico")) ?? doTurno.find((s) => !s.nivelEnsino) ?? doTurno[0];
}

/** Uma aula do professor no dia (ja com a turma integral projetada). tipo ausente = aula presencial.
 *  [PRESENCA-ASS-HA] HA: turma vazia, disciplina "HA" ou "HA*", nivelEnsino null (usa o horario das aulas dele no turno). */
export type AulaGrade = { professorId: number; numeroAula: number; turno: string; nivelEnsino: string | null; turma: string; disciplina: string; sala: string; tipo?: TipoAula; trio?: SituacaoTrio | null };

const PRIORIDADE: Record<TipoAula, number> = { aula: 0, assincrona: 1, ha: 2 };
export const tipoDe = (a: AulaGrade): TipoAula => a.tipo ?? "aula";

/** Junta as aulas do mesmo professor na mesma aula (co-docencia, turmas juntas) e ordena.
 *  [PRESENCA-ASS-HA] Se no mesmo horario houver aula e assincrona (ou HA), a linha e da aula presencial. */
export function montarDia(
  professores: Array<{ id: number; nome: string }>,
  aulas: AulaGrade[],
  slots: SlotEsquema[],
  marcas: Map<string, Marca>,
  licencas: Map<number, string>,
  turno: string,
  observacoes: Map<number, string> = new Map(),
): ProfessorDoDia[] {
  const doTurno = aulas.filter((a) => a.turno === turno);
  const saida: ProfessorDoDia[] = [];
  for (const p of [...professores].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const minhas = doTurno.filter((a) => a.professorId === p.id);
    if (!minhas.length) continue;
    // a HA nao tem turma: usa o nivel das aulas do professor no turno (no matutino o horario muda com o nivel)
    const nivelDoProfessor = minhas.find((a) => tipoDe(a) !== "ha")?.nivelEnsino ?? null;
    const porAula = new Map<number, AulaGrade[]>();
    for (const a of minhas) porAula.set(a.numeroAula, [...(porAula.get(a.numeroAula) ?? []), a]);
    const lista: AulaDoDia[] = [...porAula.entries()].sort((a, b) => a[0] - b[0]).map(([numeroAula, todos]) => {
      const tipo = todos.map(tipoDe).sort((x, y) => PRIORIDADE[x] - PRIORIDADE[y])[0]!;
      const grupo = todos.filter((g) => tipoDe(g) === tipo);
      const s = slotDaTurma(slots, turno, tipo === "ha" ? nivelDoProfessor : grupo[0]!.nivelEnsino, numeroAula);
      const ini = s ? minutosDe(s.horaInicio) : null;
      const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(" + ");
      return {
        numeroAula,
        hora: ini != null ? hhmm(ini) : "",
        fim: ini != null && s ? hhmm(ini + (s.duracaoMinutos ?? 50)) : "",
        tipo,
        // [PRESENCA-HIBRIDA] turmas juntas: presencial se for presencial em alguma
        trio: grupo.some((g) => g.trio === "presencial") ? "presencial" : grupo.some((g) => g.trio === "suporte") ? "suporte" : null,
        turmas: unicos(grupo.map((g) => g.turma)),
        disciplinas: unicos(grupo.map((g) => g.disciplina)),
        sala: unicos(grupo.map((g) => g.sala)),
        marca: marcas.get(chaveMarca(p.id, numeroAula)) ?? null,
      };
    });
    saida.push({ professorId: p.id, nome: p.nome, licenca: licencas.get(p.id) ?? null, observacao: observacoes.get(p.id) ?? null, aulas: lista });
  }
  return saida;
}

/** Rotulo da linha nos relatorios: "1ºA (assíncrona)", "HA" etc. */
export function rotuloTurmas(a: Pick<AulaDoDia, "tipo" | "turmas" | "disciplinas"> & { trio?: SituacaoTrio | null }): string {
  if (a.tipo === "ha") return a.disciplinas || "HA";
  if (a.tipo === "assincrona") return `${a.turmas} (assíncrona)`;
  return a.trio ? `${a.turmas} (híbrida, ${a.trio})` : a.turmas;
}

export function chaveMarca(professorId: number, numeroAula: number): string {
  return `${professorId}|${numeroAula}`;
}

export type RegistroMes = { professorId: number; status: Status; substitutoId: number | null };
export type ResumoProfessorMes = { professorId: number; professor: string; presente: number; falta: number; atraso: number; substituido: number; substituiu: number; marcadas: number };

/** Totais do mes por professor; "substituiu" = aulas que ele deu no lugar de outro. */
export function resumirMes(registros: RegistroMes[], nomes: Map<number, string>): ResumoProfessorMes[] {
  const r = new Map<number, ResumoProfessorMes>();
  const de = (id: number) => {
    if (!r.has(id)) r.set(id, { professorId: id, professor: nomes.get(id) ?? `#${id}`, presente: 0, falta: 0, atraso: 0, substituido: 0, substituiu: 0, marcadas: 0 });
    return r.get(id)!;
  };
  for (const x of registros) {
    const p = de(x.professorId);
    p[x.status]++;
    p.marcadas++;
    if (x.status === "substituido" && x.substitutoId != null) de(x.substitutoId).substituiu++;
  }
  return [...r.values()].sort((a, b) => a.professor.localeCompare(b.professor, "pt-BR"));
}
