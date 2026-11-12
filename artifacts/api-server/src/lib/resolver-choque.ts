// [RESOLVER-CHOQUE] (11/11/2026, pedido da dona) Na caixa vermelha de choques da simulacao, o botao "Resolver" mostra
// as trocas de aula que tiram o choque sem criar outro problema. Caso real: Romario, rascunho "manha16112026",
// Matematica da 9MF passou para o Nicolas, que ja tinha a 9ME na terca 3a; a escola nao achava a troca sozinha.
//
// Para cada choque, tenta trocar a aula do choque (que esteja no experimento) com cada outro horario da MESMA turma
// (aula ou vago). Uma troca so entra na lista se:
//   - nenhuma das aulas que mudam e fixa nem assincrona;
//   - nenhum professor que muda de horario cai em bloqueio ou HA no horario novo -- a nao ser que seja HA MOVEL
//     ([RESOLVER-CHOQUE-HA]): ai a HA vai junto para um horario livre do professor (de preferencia o que a aula dele
//     deixou), sem passar de 3 HA no dia. HA fixa e de probatorio nunca mudam;
//   - depois da troca ha MENOS choques e nenhum choque envolve as aulas que mudaram (pela mesma regra do promover,
//     horario real: choquesDeProfessor).
// Primeiro vem as trocas simples; as que mudam HA de lugar vem depois.
// Funcao pura (testada em __tests__/resolver-choque.test.ts). A rota aplica a opcao escolhida conferindo de novo.
import { choquesDeProfessor, type Choque, type SlotHora, type TurmaHora } from "./choques-professor";

export type AulaExp = {
  id: number; turmaId: number; disciplinaId: number; professorId: number | null; diaSemana: number; numeroAula: number;
  assincrona?: boolean | null; fixa?: boolean | null;
};
/** Aula da oficial que continua valendo ao promover (turmas fora do experimento). Nunca se move. */
export type AulaFora = { turmaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona?: boolean | null };
/** Horario indisponivel do professor: bloqueio ou HA. `movel` = HA que o sistema pode mudar de lugar (ehHAMovel). */
export type Indisponivel = { professorId: number; turno: string | null; diaSemana: number; horarioSlot: number; ha: boolean; movel?: boolean; motivo?: string | null };
export type Celula = { diaSemana: number; numeroAula: number };
export type MoverHa = { professorId: number; turno: string; de: Celula; para: Celula; motivo: string | null };
export type OpcaoTroca = { turmaId: number; de: Celula; para: Celula; texto: string; moverHa?: MoverHa[] };
export type ChoqueComOpcoes = { texto: string; opcoes: OpcaoTroca[] };

const DIA = ["segunda", "terça", "quarta", "quinta", "sexta"];
const onde = (c: Celula) => `${DIA[c.diaSemana] ?? c.diaSemana} ${c.numeroAula}ª`;
/** Regra de HA confirmada pela dona: ate 3 HA por dia no turno. */
const MAX_HA_DIA = 3;

type Entrada = {
  exp: AulaExp[];
  fora: AulaFora[];
  turmas: Map<number, TurmaHora>;
  slots: SlotHora[];
  indisponiveis: Indisponivel[];
  /** Numeros de aula validos de cada turma (os vagos so contam dentro deles). */
  aulasValidas: Map<number, number[]>;
  /** Turmas que nao podem ser mexidas (ex.: integral travada). */
  turmasTravadas?: Set<number>;
  nomeProfessor: (id: number) => string;
  nomeDisciplina: (id: number) => string;
  /** Maximo de opcoes por choque. */
  limite?: number;
};

type Aula = AulaExp | AulaFora;
const chave = (c: Choque<Aula>) => {
  const [x, y] = [c.a, c.b].map((a) => `${a.turmaId}|${a.diaSemana}|${a.numeroAula}`).sort();
  return `${c.professorId}|${x}|${y}`;
};
const mesma = (a: Celula, b: Celula) => a.diaSemana === b.diaSemana && a.numeroAula === b.numeroAula;

export function sugerirTrocasParaChoques(e: Entrada): ChoqueComOpcoes[] {
  const limite = e.limite ?? 5;
  const doExp = new Set<object>(e.exp);
  const calcular = (exp: AulaExp[]) => {
    const deExp = new Set<object>(exp);
    return choquesDeProfessor<Aula>([...e.fora, ...exp], e.turmas, e.slots, (a) => deExp.has(a));
  };
  const antes = calcular(e.exp);
  const nomeT = (id: number) => e.turmas.get(id)?.nome ?? `turma #${id}`;
  const indisp = new Map<string, Indisponivel>();
  for (const i of e.indisponiveis) indisp.set(`${i.professorId}|${i.turno ?? ""}|${i.diaSemana}|${i.horarioSlot}`, i);
  const turnoDe = (turmaId: number) => e.turmas.get(turmaId)?.turno;

  /** O professor tem aula (no experimento depois da troca, ou na oficial que fica) nesse horario do turno? */
  const temAula = (exp: AulaExp[], prof: number, turno: string, c: Celula) =>
    [...exp, ...e.fora].some((h) => h.professorId === prof && h.diaSemana === c.diaSemana && h.numeroAula === c.numeroAula && turnoDe(h.turmaId) === turno);

  const destinoDaHa = (exp: AulaExp[], prof: number, turno: string, de: Celula, liberada: Celula | null, horarios: number[], ocupadasHa: Set<string>): Celula | null =>
    destinoDaHaMovel({ indisponiveis: e.indisponiveis, indisp, temAula: (p, t, c) => temAula(exp, p, t, c), prof, turno, de, liberada, horarios, ocupadasHa });

  // um item por choque (o mesmo par pode aparecer duas vezes com duplas/co-docencia)
  const vistos = new Set<string>();
  const resultado: ChoqueComOpcoes[] = [];
  for (const c of antes) {
    const k = chave(c);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const texto = `${e.nomeProfessor(c.professorId)}: ${DIA[c.diaSemana] ?? c.diaSemana}, ${c.a.numeroAula}ª aula na ${nomeT(c.a.turmaId)} e ${c.b.numeroAula}ª aula na ${nomeT(c.b.turmaId)}`;
    const opcoes: Array<OpcaoTroca & { nota: number }> = [];
    for (const lado of [c.a, c.b]) {
      if (!doExp.has(lado)) continue; // aula da oficial fora do experimento: nao se mexe daqui
      const turmaId = lado.turmaId;
      if (e.turmasTravadas?.has(turmaId)) continue;
      const turma = e.turmas.get(turmaId);
      if (!turma) continue;
      const horarios = e.aulasValidas.get(turmaId) ?? [];
      const de: Celula = { diaSemana: lado.diaSemana, numeroAula: lado.numeroAula };
      const naCelula = (x: Celula) => e.exp.filter((h) => h.turmaId === turmaId && h.diaSemana === x.diaSemana && h.numeroAula === x.numeroAula);
      const blocoA = naCelula(de);
      if (blocoA.some((h) => h.fixa || h.assincrona)) continue;
      for (let dia = 0; dia < 5; dia++) {
        for (const aula of horarios) {
          const para: Celula = { diaSemana: dia, numeroAula: aula };
          if (mesma(para, de)) continue;
          if (opcoes.some((o) => o.turmaId === turmaId && mesma(o.de, para) && mesma(o.para, de))) continue;
          const blocoB = naCelula(para);
          if (blocoB.some((h) => h.fixa || h.assincrona)) continue;
          const movidas = new Set<AulaExp>();
          const exp2 = e.exp.map((h) => {
            if (blocoA.includes(h)) { const n = { ...h, ...para }; movidas.add(n); return n; }
            if (blocoB.includes(h)) { const n = { ...h, ...de }; movidas.add(n); return n; }
            return h;
          });
          // professor que muda de horario: bloqueio ou HA presa recusa; HA movel vai para outro horario dele
          const moverHa: MoverHa[] = [];
          const ocupadasHa = new Set<string>();
          let recusa = false;
          for (const [bloco, alvo, saiDe] of [[blocoA, para, de], [blocoB, de, para]] as const) {
            for (const h of bloco) {
              if (h.professorId == null) continue;
              const i = indisp.get(`${h.professorId}|${turma.turno}|${alvo.diaSemana}|${alvo.numeroAula}`);
              if (!i) continue;
              if (!i.ha || !i.movel || moverHa.some((m) => m.professorId === h.professorId)) { recusa = true; break; }
              const destino = destinoDaHa(exp2, h.professorId, turma.turno, alvo, saiDe, horarios, ocupadasHa);
              if (!destino) { recusa = true; break; }
              ocupadasHa.add(`${h.professorId}|${turma.turno}|${destino.diaSemana}|${destino.numeroAula}`);
              moverHa.push({ professorId: h.professorId, turno: turma.turno, de: alvo, para: destino, motivo: i.motivo ?? null });
            }
            if (recusa) break;
          }
          if (recusa) continue;
          const depois = calcular(exp2);
          if (depois.length >= antes.length) continue;
          if (depois.some((d) => movidas.has(d.a as AulaExp) || movidas.has(d.b as AulaExp))) continue;
          const descr = (bloco: AulaExp[]) => {
            const h = bloco[0]!;
            const profs = [...new Set(bloco.map((x) => (x.professorId != null ? e.nomeProfessor(x.professorId) : "sem professor")))].join(" + ");
            return `${e.nomeDisciplina(h.disciplinaId)} (${profs})`;
          };
          let textoOp = blocoB.length
            ? `${nomeT(turmaId)}: trocar ${descr(blocoA)} da ${onde(de)} com ${descr(blocoB)} da ${onde(para)}`
            : `${nomeT(turmaId)}: levar ${descr(blocoA)} da ${onde(de)} para a ${onde(para)} (horário vago)`;
          if (moverHa.length) textoOp += `, e a HA de ${moverHa.map((m) => `${e.nomeProfessor(m.professorId)} vai da ${onde(m.de)} para a ${onde(m.para)}`).join("; a de ")}`;
          // preferencia: troca simples antes de mexer em HA; mesmo dia; horario vago (mexe em menos gente); menos choques
          const nota = moverHa.length * 1000 + (para.diaSemana === de.diaSemana ? 0 : 10) + (blocoB.length ? 1 : 0) + depois.length * 100;
          opcoes.push({ turmaId, de, para, texto: textoOp, ...(moverHa.length ? { moverHa } : {}), nota });
        }
      }
    }
    opcoes.sort((x, y) => x.nota - y.nota || x.para.diaSemana - y.para.diaSemana || x.para.numeroAula - y.para.numeroAula);
    resultado.push({ texto, opcoes: opcoes.slice(0, limite).map(({ nota: _n, ...o }) => o) });
  }
  return resultado;
}

/**
 * [RESOLVER-CHOQUE-HA] para onde vai a HA movel que esta em `de`: horario do turno sem aula, bloqueio nem outra HA,
 * no maximo 3 HA no dia. Preferencia: o horario que a aula do professor deixou; depois o mesmo dia, colado a outra
 * atividade dele (nao abre janela); depois outro dia em que ele ja vem. Usada tambem pelo [RESOLVER-BLOQUEIO].
 */
export function destinoDaHaMovel(a: {
  indisponiveis: Indisponivel[]; indisp: Map<string, Indisponivel>; temAula: (prof: number, turno: string, c: Celula) => boolean;
  prof: number; turno: string; de: Celula; liberada: Celula | null; horarios: number[]; ocupadasHa: Set<string>;
}): Celula | null {
  const { indisponiveis, indisp, temAula, prof, turno, de, liberada, horarios, ocupadasHa } = a;
  const haNoDia = (dia: number) => indisponiveis.filter((i) => i.professorId === prof && i.turno === turno && i.ha && i.diaSemana === dia && !(i.diaSemana === de.diaSemana && i.horarioSlot === de.numeroAula)).length
    + [...ocupadasHa].filter((k) => k.startsWith(`${prof}|${turno}|${dia}|`)).length;
  const livre = (c: Celula) => !mesma(c, de) && !indisp.has(`${prof}|${turno}|${c.diaSemana}|${c.numeroAula}`)
    && !ocupadasHa.has(`${prof}|${turno}|${c.diaSemana}|${c.numeroAula}`) && !temAula(prof, turno, c) && haNoDia(c.diaSemana) < MAX_HA_DIA;
  const atividade = (c: Celula) => temAula(prof, turno, c) || indisp.has(`${prof}|${turno}|${c.diaSemana}|${c.numeroAula}`);
  const vemNoDia = (dia: number) => horarios.some((n) => temAula(prof, turno, { diaSemana: dia, numeroAula: n }));
  const candidatos: Array<{ c: Celula; nota: number }> = [];
  for (let dia = 0; dia < 5; dia++) {
    for (const n of horarios) {
      const c = { diaSemana: dia, numeroAula: n };
      if (!livre(c)) continue;
      const colada = atividade({ diaSemana: dia, numeroAula: n - 1 }) || atividade({ diaSemana: dia, numeroAula: n + 1 });
      const nota = (liberada && mesma(c, liberada) ? 0 : 10) + (dia === de.diaSemana ? 0 : 5) + (colada ? 0 : 3) + (vemNoDia(dia) ? 0 : 20);
      candidatos.push({ c, nota });
    }
  }
  candidatos.sort((x, y) => x.nota - y.nota || x.c.diaSemana - y.c.diaSemana || x.c.numeroAula - y.c.numeroAula);
  return candidatos[0]?.c ?? null;
}

/** Mesma opcao (turma, de, para e as mesmas HA movidas)? Usada pela rota para so aplicar o que ela mesma sugere. */
export function mesmaOpcao(a: Pick<OpcaoTroca, "turmaId" | "de" | "para" | "moverHa">, b: Pick<OpcaoTroca, "turmaId" | "de" | "para" | "moverHa">): boolean {
  const ha = (o: Pick<OpcaoTroca, "moverHa">) => (o.moverHa ?? []).map((m) => `${m.professorId}|${m.turno}|${m.de.diaSemana}-${m.de.numeroAula}|${m.para.diaSemana}-${m.para.numeroAula}`).sort().join(";");
  return a.turmaId === b.turmaId && mesma(a.de, b.de) && mesma(a.para, b.para) && ha(a) === ha(b);
}
