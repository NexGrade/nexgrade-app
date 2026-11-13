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
  if (a.tipo === "assincrona") return `${a.turmas} · ${a.disciplinas} (assíncrona)`; // [PRESENCA-ASS-DISCIPLINA]
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

// [PRESENCA-PERIODO] (06/11/2026) Relatorio da presenca por periodo, em tres formatos:
//  geral      = uma linha por professor (contagens e % de presenca) + TOTAL + ocorrencias do periodo
//  individual = um bloco por professor (ou so o escolhido), aula a aula, com a observacao geral do dia
//  total      = numeros da escola no periodo
// Devolve uma tabela generica (titulos, colunas e linhas) que vira PDF na rota e Excel na tela.
export const TIPOS_RELATORIO = ["geral", "individual", "total"] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];
export const ROTULO_RELATORIO: Record<TipoRelatorio, string> = { geral: "Geral", individual: "Individual", total: "Total" };

export type RegistroPeriodo = {
  data: string; turno: string; numeroAula: number; professorId: number; status: Status;
  substitutoId: number | null; substitutoNome: string | null; observacao: string | null;
};
export type ObservacaoPeriodo = { data: string; turno: string; professorId: number; observacao: string };
export type TabelaRelatorio = {
  titulo: string; subtitulo: string; vazio: string;
  colunas: Array<{ titulo: string; peso: number; alinhar?: "centro" }>;
  linhas: Array<{ celulas: string[]; destaque?: boolean; grupo?: boolean; cabecalho?: boolean; mesclarDe?: number }>;
};

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const ORDEM_TURNO: Record<string, number> = { matutino: 0, vespertino: 1, noturno: 2 };
type Ordenavel = { data: string; turno: string; numeroAula?: number };
const porDataTurnoAula = (a: Ordenavel, b: Ordenavel) =>
  a.data.localeCompare(b.data) || (ORDEM_TURNO[a.turno] ?? 9) - (ORDEM_TURNO[b.turno] ?? 9) || (a.numeroAula ?? 0) - (b.numeroAula ?? 0);

/** % de presenca: aulas dadas pelo proprio professor (presente + atraso) sobre as marcadas. */
export function percentualPresenca(r: { presente: number; atraso: number; marcadas: number }): string {
  if (!r.marcadas) return "—";
  return `${(Math.round(((r.presente + r.atraso) / r.marcadas) * 1000) / 10).toLocaleString("pt-BR")}%`;
}

export function relatorioPeriodo(o: {
  tipo: TipoRelatorio; de: string; ate: string;
  registros: RegistroPeriodo[]; observacoes: ObservacaoPeriodo[];
  nomes: Map<number, string>; professorId?: number | null;
}): TabelaRelatorio {
  const nome = (id: number) => o.nomes.get(id) ?? `#${id}`;
  const periodo = o.de === o.ate ? dataBR(o.de) : `${dataBR(o.de)} a ${dataBR(o.ate)}`;
  const titulo = `Presença dos professores — ${ROTULO_RELATORIO[o.tipo]} — ${periodo}`;
  const substituto = (r: RegistroPeriodo) => (r.status !== "substituido" ? "" : r.substitutoId != null ? nome(r.substitutoId) : r.substitutoNome ?? "");
  const obsDoDia = new Map(o.observacoes.map((x) => [`${x.data}|${x.turno}|${x.professorId}`, x.observacao]));
  const resumo = resumirMes(o.registros, o.nomes);
  const soma = (k: "presente" | "falta" | "atraso" | "substituido" | "substituiu" | "marcadas") => resumo.reduce((s, r) => s + r[k], 0);
  const total = { presente: soma("presente"), falta: soma("falta"), atraso: soma("atraso"), substituido: soma("substituido"), marcadas: soma("marcadas") };

  if (o.tipo === "total") {
    const dias = new Set(o.registros.map((r) => r.data));
    const linha = (rotulo: string, valor: string | number, destaque = false) => ({ celulas: [rotulo, String(valor)], destaque });
    const porTurno = TURNOS_DIA.flatMap((t) => {
      const doTurno = o.registros.filter((r) => r.turno === t);
      if (!doTurno.length) return [];
      const c = (s: Status) => doTurno.filter((r) => r.status === s).length;
      return [linha(`${ROTULO_TURNO[t]}: aulas marcadas · faltas · atrasos · substituídas`, `${doTurno.length} · ${c("falta")} · ${c("atraso")} · ${c("substituido")}`)];
    });
    function quemFaltou(): TabelaRelatorio["linhas"] {
      const faltas = o.registros.filter((r) => r.status === "falta").sort(porDataTurnoAula);
      if (!faltas.length) return [];
      const porProf = new Map<number, RegistroPeriodo[]>();
      for (const f of faltas) porProf.set(f.professorId, [...(porProf.get(f.professorId) ?? []), f]);
      const ordem = [...porProf.entries()].sort((a, b) => b[1].length - a[1].length || nome(a[0]).localeCompare(nome(b[0]), "pt-BR"));
      return [
        { grupo: true, celulas: ["Quem faltou no período", ""] },
        ...ordem.flatMap(([id, fs]) => {
          const porDia = new Map<string, string[]>();
          for (const f of fs) { const k = `${dataBR(f.data).slice(0, 5)}${o.registros.some((r) => r.data === f.data && r.turno !== f.turno) ? ` ${ROTULO_TURNO[f.turno] ?? f.turno}` : ""}`; porDia.set(k, [...(porDia.get(k) ?? []), `${f.numeroAula}ª`]); }
          const dias = [...porDia.entries()].map(([d, aulas]) => `${d} (${aulas.join(", ")})`);
          // muitos dias: continua nas linhas de baixo (o PDF corta texto longo)
          const blocos: string[][] = [];
          for (let i = 0; i < dias.length; i += 5) blocos.push(dias.slice(i, i + 5));
          return blocos.map((b, i) => ({
            destaque: true,
            celulas: [i === 0 ? `${nome(id)} — ${b.join("; ")}` : `     ${b.join("; ")}`, i === 0 ? `${fs.length} falta${fs.length === 1 ? "" : "s"}` : ""],
          }));
        }),
      ];
    }
    const linhas = o.registros.length || o.observacoes.length ? [
      linha("Aulas marcadas", total.marcadas),
      linha("Presente", total.presente),
      linha("Falta", total.falta, total.falta > 0),
      linha("Atraso", total.atraso),
      linha("Substituído (outro professor deu a aula)", total.substituido),
      linha("% de presença (presente + atraso)", percentualPresenca(total)),
      linha("Dias com marcação", dias.size),
      linha("Professores com aula marcada", resumo.filter((r) => r.marcadas > 0).length),
      linha("Professores com pelo menos uma falta", resumo.filter((r) => r.falta > 0).length),
      linha("Observações do dia registradas", o.observacoes.length),
      ...porTurno,
      // [PRESENCA-TOTAL-QUEM-FALTOU] (06/11/2026) pedido da dona: o Total diz QUEM faltou (com os dias e as aulas)
      ...quemFaltou(),
    ] : [];
    return {
      titulo, subtitulo: "Totais da escola no período, pela lista de presença.", vazio: "Nenhuma presença marcada no período.",
      colunas: [{ titulo: "Indicador", peso: 70 }, { titulo: "Quantidade", peso: 30, alinhar: "centro" }], linhas,
    };
  }

  if (o.tipo === "geral") {
    const ocorrencias = o.registros.filter((r) => r.status !== "presente").sort(porDataTurnoAula);
    const linhas: TabelaRelatorio["linhas"] = resumo.map((r) => ({
      destaque: r.falta > 0,
      celulas: [r.professor, String(r.presente), String(r.falta), String(r.atraso), String(r.substituido), String(r.substituiu), String(r.marcadas), percentualPresenca(r)],
    }));
    if (resumo.length) linhas.push({ celulas: ["TOTAL", String(total.presente), String(total.falta), String(total.atraso), String(total.substituido), String(soma("substituiu")), String(total.marcadas), percentualPresenca(total)] });
    if (ocorrencias.length) {
      linhas.push({ grupo: true, celulas: ["Ocorrências do período (faltas, atrasos e substituições)", "", "", "", "", "", "", ""] });
      // [PDF-TABELA-SEGUNDA-TABELA] a Observacao ocupa as 3 ultimas colunas (sai inteira no PDF)
      linhas.push({ cabecalho: true, mesclarDe: 5, celulas: ["Professor", "Data", "Aula", "Situação", "Substituto", "Observação", "", ""] });
      for (const r of ocorrencias) linhas.push({
        destaque: r.status === "falta", mesclarDe: 5,
        celulas: [nome(r.professorId), dataBR(r.data), `${ROTULO_TURNO[r.turno] ?? r.turno} ${r.numeroAula}ª`, ROTULO_STATUS[r.status], substituto(r),
          [obsDoDia.get(`${r.data}|${r.turno}|${r.professorId}`), r.observacao].filter(Boolean).join(" · "), "", ""],
      });
    }
    return {
      titulo, subtitulo: "Contagem por aula marcada. \"Substituiu\" = aulas que o professor deu no lugar de outro. % = (presente + atraso) / marcadas.",
      vazio: "Nenhuma presença marcada no período.",
      colunas: [{ titulo: "Professor", peso: 28 }, { titulo: "Presente", peso: 9, alinhar: "centro" }, { titulo: "Falta", peso: 8, alinhar: "centro" }, { titulo: "Atraso", peso: 8, alinhar: "centro" },
        { titulo: "Substituído", peso: 11, alinhar: "centro" }, { titulo: "Substituiu", peso: 10, alinhar: "centro" }, { titulo: "Marcadas", peso: 10, alinhar: "centro" }, { titulo: "% presença", peso: 11, alinhar: "centro" }],
      linhas,
    };
  }

  // individual: um bloco por professor, aula a aula; a observacao geral do dia sai na primeira linha do dia
  const ids = o.professorId != null ? [o.professorId]
    : [...new Set([...o.registros.map((r) => r.professorId), ...o.observacoes.map((x) => x.professorId)])].sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR"));
  const linhas: TabelaRelatorio["linhas"] = [];
  for (const id of ids) {
    const meus = o.registros.filter((r) => r.professorId === id);
    const minhasObs = o.observacoes.filter((x) => x.professorId === id);
    if (!meus.length && !minhasObs.length) continue;
    const r = resumo.find((x) => x.professorId === id) ?? { presente: 0, falta: 0, atraso: 0, substituido: 0, substituiu: 0, marcadas: 0 };
    linhas.push({ grupo: true, celulas: [`${nome(id)} — P ${r.presente} · F ${r.falta} · A ${r.atraso} · S ${r.substituido} · substituiu ${r.substituiu} · presença ${percentualPresenca(r)}`, "", "", "", "", ""] });
    const itens: Array<Ordenavel & { reg: RegistroPeriodo | null }> = [
      ...meus.map((reg) => ({ data: reg.data, turno: reg.turno, numeroAula: reg.numeroAula, reg })),
      ...minhasObs.filter((x) => !meus.some((m) => m.data === x.data && m.turno === x.turno)).map((x) => ({ data: x.data, turno: x.turno, numeroAula: -1, reg: null })),
    ].sort(porDataTurnoAula);
    const jaSaiu = new Set<string>();
    for (const it of itens) {
      const k = `${it.data}|${it.turno}|${id}`;
      const geral = jaSaiu.has(k) ? null : obsDoDia.get(k) ?? null;
      jaSaiu.add(k);
      linhas.push({
        destaque: it.reg?.status === "falta",
        celulas: [dataBR(it.data), ROTULO_TURNO[it.turno] ?? it.turno, it.reg ? `${it.reg.numeroAula}ª` : "—", it.reg ? ROTULO_STATUS[it.reg.status] : "Observação",
          it.reg ? substituto(it.reg) : "", [geral, it.reg?.observacao].filter(Boolean).join(" · ")],
      });
    }
  }
  return {
    titulo: o.professorId != null ? `${titulo} — ${nome(o.professorId)}` : titulo,
    subtitulo: "Aula a aula, por professor. A observação do dia aparece na primeira aula daquele dia.",
    vazio: o.professorId != null ? "Nenhuma presença marcada para este professor no período." : "Nenhuma presença marcada no período.",
    colunas: [{ titulo: "Data", peso: 11, alinhar: "centro" }, { titulo: "Turno", peso: 9, alinhar: "centro" }, { titulo: "Aula", peso: 7, alinhar: "centro" },
      { titulo: "Situação", peso: 12, alinhar: "centro" }, { titulo: "Substituto", peso: 20 }, { titulo: "Observação", peso: 41 }],
    linhas,
  };
}
