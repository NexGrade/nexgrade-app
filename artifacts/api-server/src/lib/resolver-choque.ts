// [RESOLVER-CHOQUE] (11/11/2026, pedido da dona) Na caixa vermelha de choques da simulacao, o botao "Resolver" mostra
// as trocas de aula que tiram o choque sem criar outro problema. Caso real: Romario, rascunho "manha16112026",
// Matematica da 9MF passou para o Nicolas, que ja tinha a 9ME na terca 3a; a escola nao achava a troca sozinha.
//
// Para cada choque, tenta trocar a aula do choque (que esteja no experimento) com cada outro horario da MESMA turma
// (aula ou vago). Uma troca so entra na lista se:
//   - nenhuma das aulas que mudam e fixa nem assincrona;
//   - nenhum professor que muda de horario cai em bloqueio ou HA no horario novo;
//   - depois da troca ha MENOS choques e nenhum choque envolve as aulas que mudaram (pela mesma regra do promover,
//     horario real: choquesDeProfessor).
// Funcao pura (testada em __tests__/resolver-choque.test.ts). A rota aplica a troca escolhida pela rota de sempre
// (trocar-aulas), que confere de novo.
import { choquesDeProfessor, type Choque, type SlotHora, type TurmaHora } from "./choques-professor";

export type AulaExp = {
  id: number; turmaId: number; disciplinaId: number; professorId: number | null; diaSemana: number; numeroAula: number;
  assincrona?: boolean | null; fixa?: boolean | null;
};
/** Aula da oficial que continua valendo ao promover (turmas fora do experimento). Nunca se move. */
export type AulaFora = { turmaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona?: boolean | null };
export type Indisponivel = { professorId: number; turno: string | null; diaSemana: number; horarioSlot: number; ha: boolean };
export type Celula = { diaSemana: number; numeroAula: number };
export type OpcaoTroca = { turmaId: number; de: Celula; para: Celula; texto: string };
export type ChoqueComOpcoes = { texto: string; opcoes: OpcaoTroca[] };

const DIA = ["segunda", "terça", "quarta", "quinta", "sexta"];
const onde = (c: Celula) => `${DIA[c.diaSemana] ?? c.diaSemana} ${c.numeroAula}ª`;

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
      const de: Celula = { diaSemana: lado.diaSemana, numeroAula: lado.numeroAula };
      const naCelula = (x: Celula) => e.exp.filter((h) => h.turmaId === turmaId && h.diaSemana === x.diaSemana && h.numeroAula === x.numeroAula);
      const blocoA = naCelula(de);
      if (blocoA.some((h) => h.fixa || h.assincrona)) continue;
      for (let dia = 0; dia < 5; dia++) {
        for (const aula of e.aulasValidas.get(turmaId) ?? []) {
          const para: Celula = { diaSemana: dia, numeroAula: aula };
          if (para.diaSemana === de.diaSemana && para.numeroAula === de.numeroAula) continue;
          if (opcoes.some((o) => o.turmaId === turmaId && ((o.de.diaSemana === para.diaSemana && o.de.numeroAula === para.numeroAula && o.para.diaSemana === de.diaSemana && o.para.numeroAula === de.numeroAula)))) continue;
          const blocoB = naCelula(para);
          if (blocoB.some((h) => h.fixa || h.assincrona)) continue;
          // professor que muda de horario nao pode cair em bloqueio ou HA
          const cai = (bloco: AulaExp[], alvo: Celula) => bloco.some((h) => h.professorId != null && indisp.has(`${h.professorId}|${turma.turno}|${alvo.diaSemana}|${alvo.numeroAula}`));
          if (cai(blocoA, para) || cai(blocoB, de)) continue;
          const movidas = new Set<AulaExp>();
          const exp2 = e.exp.map((h) => {
            if (blocoA.includes(h)) { const n = { ...h, ...para }; movidas.add(n); return n; }
            if (blocoB.includes(h)) { const n = { ...h, ...de }; movidas.add(n); return n; }
            return h;
          });
          const depois = calcular(exp2);
          if (depois.length >= antes.length) continue;
          if (depois.some((d) => movidas.has(d.a as AulaExp) || movidas.has(d.b as AulaExp))) continue;
          const descr = (bloco: AulaExp[]) => {
            const h = bloco[0]!;
            const profs = [...new Set(bloco.map((x) => (x.professorId != null ? e.nomeProfessor(x.professorId) : "sem professor")))].join(" + ");
            return `${e.nomeDisciplina(h.disciplinaId)} (${profs})`;
          };
          const textoOp = blocoB.length
            ? `${nomeT(turmaId)}: trocar ${descr(blocoA)} da ${onde(de)} com ${descr(blocoB)} da ${onde(para)}`
            : `${nomeT(turmaId)}: levar ${descr(blocoA)} da ${onde(de)} para a ${onde(para)} (horário vago)`;
          // preferencia: mesmo dia, depois horario vago (mexe em menos gente), depois o que tira mais choques
          const nota = (para.diaSemana === de.diaSemana ? 0 : 10) + (blocoB.length ? 1 : 0) + depois.length * 100;
          opcoes.push({ turmaId, de, para, texto: textoOp, nota });
        }
      }
    }
    opcoes.sort((x, y) => x.nota - y.nota || x.para.diaSemana - y.para.diaSemana || x.para.numeroAula - y.para.numeroAula);
    resultado.push({ texto, opcoes: opcoes.slice(0, limite).map(({ nota: _n, ...o }) => o) });
  }
  return resultado;
}
