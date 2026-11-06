// [AGENDA-ASSINCRONAS] (06/11/2026) Agenda das aulas assincronas por periodo (pedido da dona): dia a dia, cada aula
// assincrona da grade oficial com o professor responsavel. Regra confirmada em 06/11/2026: na Hibrida (trio com
// revezamento) a assincrona da semana e do professor que esta PRESENCIAL naquela semana; nas outras, do proprio
// professor da disciplina. Funcao pura (testada em __tests__/agenda-assincronas.test.ts); a rota monta os dados.
import { hhmm, minutosDe, slotDaTurma, type SlotEsquema, type TabelaRelatorio } from "./presenca";

export type AulaAssincrona = {
  turmaId: number; turma: string; turno: string; nivelEnsino: string | null;
  diaSemana: number; numeroAula: number; disciplinaId: number; disciplina: string; professorId: number;
};
export type TrioDaAula = { grupo: string; ordem: number; inicio: string };
export type DiaDaAgenda = { data: string; semAula?: string | null };

const NOME_DIA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const ROTULO_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const ORDEM_TURNO: Record<string, number> = { matutino: 0, vespertino: 1, noturno: 2 };
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

export type LinhaAgenda = {
  data: string; turno: string; numeroAula: number; hora: string; turma: string; disciplina: string;
  professorId: number; professor: string; trio: string | null;
};

/** As assincronas de cada dia, ja com o responsavel (no trio so a do professor presencial da semana). */
export function montarAgendaAssincronas(o: {
  dias: DiaDaAgenda[];
  aulas: AulaAssincrona[];
  trio: Map<string, TrioDaAula>; // chave turmaId|disciplinaId|professorId
  slots: SlotEsquema[];
  nomes: Map<number, string>;
  ordemDaSemana: (inicio: string, dataISO: string) => number;
  professorId?: number | null;
}): LinhaAgenda[] {
  const saida: LinhaAgenda[] = [];
  for (const dia of o.dias) {
    if (dia.semAula) continue;
    const dow = new Date(`${dia.data}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const doDia = o.aulas.filter((a) => a.diaSemana === dow - 1);
    // trio: as linhas do mesmo grupo no mesmo horario viram uma so, a do professor presencial da semana
    const vistos = new Set<string>();
    for (const a of doDia) {
      const t = o.trio.get(`${a.turmaId}|${a.disciplinaId}|${a.professorId}`);
      if (t) {
        const k = `${a.turmaId}|${a.numeroAula}|${t.grupo}`;
        if (vistos.has(k)) continue;
        const grupo = doDia.filter((b) => b.turmaId === a.turmaId && b.numeroAula === a.numeroAula && o.trio.get(`${b.turmaId}|${b.disciplinaId}|${b.professorId}`)?.grupo === t.grupo);
        vistos.add(k);
        const daVez = grupo.find((b) => { const tb = o.trio.get(`${b.turmaId}|${b.disciplinaId}|${b.professorId}`)!; return tb.ordem === o.ordemDaSemana(tb.inicio, dia.data); });
        if (daVez) { saida.push(linha(dia.data, daVez, t.grupo)); continue; }
        // a assincrona deste horario nao e da disciplina da vez: fica com o professor presencial da semana mesmo assim
        const membro = [...o.trio.entries()].find(([, x]) => x.grupo === t.grupo && x.ordem === o.ordemDaSemana(x.inicio, dia.data));
        const profDaVez = membro ? Number(membro[0].split("|")[2]) : a.professorId;
        saida.push(linha(dia.data, { ...a, professorId: profDaVez, disciplina: grupo.map((g) => g.disciplina).filter((d, i, xs) => xs.indexOf(d) === i).join(" / ") }, t.grupo));
      } else {
        saida.push(linha(dia.data, a, null));
      }
    }
  }
  function linha(data: string, a: AulaAssincrona, trio: string | null): LinhaAgenda {
    const s = slotDaTurma(o.slots, a.turno, a.nivelEnsino, a.numeroAula);
    return {
      data, turno: a.turno, numeroAula: a.numeroAula, hora: s ? hhmm(minutosDe(s.horaInicio)) : "",
      turma: a.turma, disciplina: a.disciplina, professorId: a.professorId, professor: o.nomes.get(a.professorId) ?? `#${a.professorId}`, trio,
    };
  }
  return saida
    .filter((l) => o.professorId == null || l.professorId === o.professorId)
    .sort((a, b) => a.data.localeCompare(b.data) || (ORDEM_TURNO[a.turno] ?? 9) - (ORDEM_TURNO[b.turno] ?? 9) || a.numeroAula - b.numeroAula || a.turma.localeCompare(b.turma, "pt-BR"));
}

/** Tabela para PDF/Excel: um bloco por dia (dias sem aula aparecem com o motivo). */
export function tabelaAgendaAssincronas(o: {
  de: string; ate: string; dias: DiaDaAgenda[]; linhas: LinhaAgenda[]; professor?: string | null;
}): TabelaRelatorio {
  const periodo = o.de === o.ate ? dataBR(o.de) : `${dataBR(o.de)} a ${dataBR(o.ate)}`;
  const linhas: TabelaRelatorio["linhas"] = [];
  for (const dia of o.dias) {
    const dow = new Date(`${dia.data}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const doDia = o.linhas.filter((l) => l.data === dia.data);
    if (dia.semAula) { linhas.push({ grupo: true, celulas: [`${NOME_DIA[dow]}, ${dataBR(dia.data)} — ${dia.semAula} (sem aula)`, "", "", "", ""] }); continue; }
    if (!doDia.length) continue;
    linhas.push({ grupo: true, celulas: [`${NOME_DIA[dow]}, ${dataBR(dia.data)}`, "", "", "", ""] });
    for (const l of doDia) linhas.push({
      celulas: [ROTULO_TURNO[l.turno] ?? l.turno, `${l.numeroAula}ª ${l.hora}`.trim(), l.turma, l.trio ? `${l.disciplina} (Híbrida)` : l.disciplina, l.professor],
    });
  }
  return {
    titulo: `Agenda das aulas assíncronas — ${periodo}${o.professor ? ` — ${o.professor}` : ""}`,
    subtitulo: "Pela grade oficial. Na Híbrida (trio), a assíncrona da semana é do professor que está presencial naquela semana.",
    vazio: o.professor ? "Nenhuma aula assíncrona deste professor no período." : "Nenhuma aula assíncrona no período.",
    colunas: [{ titulo: "Turno", peso: 10, alinhar: "centro" }, { titulo: "Aula", peso: 12, alinhar: "centro" }, { titulo: "Turma", peso: 18 }, { titulo: "Disciplina", peso: 32 }, { titulo: "Professor responsável", peso: 28 }],
    linhas,
  };
}

// [CALENDARIO-ASSINCRONAS] (06/11/2026) Calendario trimestral das assincronas (Imprimir Grade): por turma, uma linha
// por semana com os 5 dias e, na semana, quem esta presencial na Hibrida (o mesmo professor da assincrona do trio).
export type DiaCalendario = { data: string; fora: boolean; semAula: string | null; itens: LinhaAgenda[] };
export type SemanaCalendario = { segunda: string; dias: DiaCalendario[]; presenciais: string[] };
export type CalendarioTurma = { turma: string; turno: string; semanas: SemanaCalendario[] };

const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export function segundaDe(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return somaDias(iso, -((dow + 6) % 7));
}

export function calendarioPorTurma(
  dias: DiaDaAgenda[], linhas: LinhaAgenda[],
  presenciaisDaSemana?: (turma: string, segunda: string) => string[], // pelo revezamento (mesmo sem assincrona na semana)
): CalendarioTurma[] {
  if (!dias.length) return [];
  const de = dias[0]!.data, ate = dias[dias.length - 1]!.data;
  const semAula = new Map(dias.map((d) => [d.data, d.semAula ?? null]));
  const segundas: string[] = [];
  for (let s = segundaDe(de); s <= ate; s = somaDias(s, 7)) segundas.push(s);
  const chaves = [...new Set(linhas.map((l) => `${l.turno}|${l.turma}`))]
    .sort((a, b) => (ORDEM_TURNO[a.split("|")[0]!] ?? 9) - (ORDEM_TURNO[b.split("|")[0]!] ?? 9) || a.split("|")[1]!.localeCompare(b.split("|")[1]!, "pt-BR", { numeric: true }));
  return chaves.map((k) => {
    const [turno, turma] = k.split("|") as [string, string];
    const daTurma = linhas.filter((l) => l.turno === turno && l.turma === turma);
    const semanas = segundas.map((segunda) => {
      const ds = [0, 1, 2, 3, 4].map((i) => {
        const data = somaDias(segunda, i);
        const fora = data < de || data > ate;
        return { data, fora, semAula: fora ? null : semAula.get(data) ?? null, itens: fora ? [] : daTurma.filter((l) => l.data === data) };
      });
      const presenciais = presenciaisDaSemana ? presenciaisDaSemana(turma, segunda)
        : [...new Set(ds.flatMap((d) => d.itens.filter((l) => l.trio).map((l) => l.disciplina.includes(" / ") ? l.professor : `${l.professor} (${l.disciplina})`)))];
      return { segunda, dias: ds, presenciais };
    });
    return { turma, turno, semanas };
  });
}
