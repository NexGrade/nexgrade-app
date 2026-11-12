// [RESOLVER-BLOQUEIO] (12/11/2026, pedido da dona) "Ver como resolver" tambem no quadro vermelho de aula em horario
// bloqueado do professor ([AULA-EM-BLOQUEIO]). Caso real: Romario, rascunho "manha16112026", Nicolas bloqueado quarta e
// quinta no rascunho com a Matematica da 9MF na quinta 5a. Nao havia troca de duas aulas que resolvesse; a saida era um
// ciclo de tres aulas na 9MF (Nicolas qui 5a -> sex 2a, Andrew sex 2a -> qui 4a, Thayna qui 4a -> qui 5a).
//
// Para cada aula do experimento em horario bloqueado, tenta, dentro da MESMA turma:
//   - trocar com outro horario (aula ou vago) -- ciclo de 2;
//   - um ciclo de 3: a aula vai para X, a aula de X vai para Y e a de Y vem para o horario bloqueado.
// Uma opcao so entra se:
//   - nenhuma aula que muda e fixa nem assincrona, e a turma nao esta travada;
//   - nenhum professor que muda cai em bloqueio, HA fixa ou HA de probatorio; HA MOVEL vai para outro horario livre dele
//     (mesma regra do resolver de choques: destinoDaHaMovel, ate 3 HA no dia);
//   - nenhum choque de professor envolve as aulas que mudaram e o total de choques nao aumenta (horario real);
//   - a aula sai do bloqueio e nenhuma aula que mudou cai em outro bloqueio.
// Ordem: menos janelas abertas, menos HA mudando de lugar, ciclo de 2 antes do de 3, mesmo dia.
// Funcao pura (testada em __tests__/resolver-bloqueio.test.ts). A rota aplica a opcao escolhida conferindo de novo.
import { choquesDeProfessor, type SlotHora, type TurmaHora } from "./choques-professor";
import { destinoDaHaMovel, type AulaExp, type AulaFora, type Celula, type Indisponivel, type MoverHa } from "./resolver-choque";

/** Opcao: `ciclo[i]` vai para `ciclo[i+1]` (o ultimo volta ao primeiro). Ciclo de 2 = troca simples. */
export type OpcaoCiclo = { turmaId: number; ciclo: Celula[]; texto: string; moverHa?: MoverHa[]; janelasAMais?: number };
export type BloqueioComOpcoes = { texto: string; opcoes: OpcaoCiclo[] };

const DIA = ["segunda", "terça", "quarta", "quinta", "sexta"];
const onde = (c: Celula) => `${DIA[c.diaSemana] ?? c.diaSemana} ${c.numeroAula}ª`;
const mesma = (a: Celula, b: Celula) => a.diaSemana === b.diaSemana && a.numeroAula === b.numeroAula;
const k4 = (prof: number, turno: string | null, dia: number, aula: number) => `${prof}|${turno ?? ""}|${dia}|${aula}`;

type Entrada = {
  exp: AulaExp[];
  fora: AulaFora[];
  turmas: Map<number, TurmaHora>;
  slots: SlotHora[];
  /** `bloqueia` = a regra do quadro vermelho ([AULA-EM-BLOQUEIO], ehBloqueioParaMotor): decide QUAIS aulas resolver. */
  indisponiveis: Array<Indisponivel & { bloqueia?: boolean }>;
  aulasValidas: Map<number, number[]>;
  turmasTravadas?: Set<number>;
  nomeProfessor: (id: number) => string;
  nomeDisciplina: (id: number) => string;
  limite?: number;
};
type Aula = AulaExp | AulaFora;

export function sugerirTrocasParaBloqueios(e: Entrada): BloqueioComOpcoes[] {
  const limite = e.limite ?? 5;
  const turnoDe = (turmaId: number) => e.turmas.get(turmaId)?.turno;
  const nomeT = (id: number) => e.turmas.get(id)?.nome ?? `turma #${id}`;
  const indisp = new Map<string, Indisponivel & { bloqueia?: boolean }>();
  for (const i of e.indisponiveis) indisp.set(k4(i.professorId, i.turno, i.diaSemana, i.horarioSlot), i);
  /** bloqueio de verdade, HA fixa ou HA de probatorio (o que o motor nao usa) */
  const travaEm = (prof: number, turno: string, c: Celula) => {
    const i = indisp.get(k4(prof, turno, c.diaSemana, c.numeroAula));
    return i && (!i.ha || !i.movel) ? i : null;
  };
  const haMovelEm = (prof: number, turno: string, c: Celula) => {
    const i = indisp.get(k4(prof, turno, c.diaSemana, c.numeroAula));
    return i && i.ha && i.movel ? i : null;
  };
  const calcularChoques = (exp: AulaExp[]) => {
    const deExp = new Set<object>(exp);
    return choquesDeProfessor<Aula>([...e.fora, ...exp], e.turmas, e.slots, (a) => deExp.has(a));
  };
  const choquesAntes = calcularChoques(e.exp).length;
  const temAula = (exp: AulaExp[], prof: number, turno: string, c: Celula) =>
    [...exp, ...e.fora].some((h) => h.professorId === prof && h.diaSemana === c.diaSemana && h.numeroAula === c.numeroAula && turnoDe(h.turmaId) === turno);
  /** janelas do professor no dia (buraco entre a primeira e a ultima atividade; HA conta como atividade) */
  const janelas = (exp: AulaExp[], haExtra: Set<string>, haSai: Set<string>, prof: number, turno: string, dia: number, horarios: number[]) => {
    const ocupado = horarios.filter((n) => temAula(exp, prof, turno, { diaSemana: dia, numeroAula: n })
      || haExtra.has(k4(prof, turno, dia, n))
      || (!!indisp.get(k4(prof, turno, dia, n))?.ha && !haSai.has(k4(prof, turno, dia, n))));
    if (ocupado.length < 2) return 0;
    const [ini, fim] = [Math.min(...ocupado), Math.max(...ocupado)];
    return horarios.filter((n) => n > ini && n < fim && !ocupado.includes(n)).length;
  };

  const resultado: BloqueioComOpcoes[] = [];
  const vistos = new Set<string>();
  for (const alvo of e.exp) {
    if (alvo.professorId == null || alvo.assincrona) continue;
    const turma = e.turmas.get(alvo.turmaId);
    if (!turma) continue;
    const A: Celula = { diaSemana: alvo.diaSemana, numeroAula: alvo.numeroAula };
    const trava = indisp.get(k4(alvo.professorId, turma.turno, A.diaSemana, A.numeroAula));
    if (!trava || !(trava.bloqueia ?? (!trava.ha || !trava.movel))) continue;
    const kAlvo = `${alvo.turmaId}|${alvo.professorId}|${A.diaSemana}|${A.numeroAula}`;
    if (vistos.has(kAlvo)) continue;
    vistos.add(kAlvo);
    const tipo = !trava.ha ? "bloqueio" : (trava.motivo ?? "").startsWith("HA fixa") ? "HA fixa" : /probat/i.test(trava.motivo ?? "") ? "HA de probatório" : "HA";
    const texto = `${e.nomeProfessor(alvo.professorId)} tem ${tipo} na ${onde(A)} aula, onde está a aula da ${nomeT(alvo.turmaId)}`;
    const opcoes: Array<OpcaoCiclo & { nota: number }> = [];
    const turmaId = alvo.turmaId;
    const horarios = e.aulasValidas.get(turmaId) ?? [];
    const naCelula = (c: Celula) => e.exp.filter((h) => h.turmaId === turmaId && h.diaSemana === c.diaSemana && h.numeroAula === c.numeroAula);
    const blocoA = naCelula(A);
    if (e.turmasTravadas?.has(turmaId) || blocoA.some((h) => h.fixa || h.assincrona)) { resultado.push({ texto, opcoes: [] }); continue; }
    const celulas: Celula[] = [];
    for (let dia = 0; dia < 5; dia++) for (const n of horarios) { const c = { diaSemana: dia, numeroAula: n }; if (!mesma(c, A)) celulas.push(c); }
    const livreDeFixa = (c: Celula) => !naCelula(c).some((h) => h.fixa || h.assincrona);

    const avaliar = (ciclo: Celula[]) => {
      const blocos = ciclo.map((c) => naCelula(c));
      // vai: bloco de ciclo[i] para ciclo[i+1]
      const movidas = new Set<AulaExp>();
      const destinoDe = new Map<AulaExp, Celula>();
      blocos.forEach((b, i) => { const para = ciclo[(i + 1) % ciclo.length]!; for (const h of b) destinoDe.set(h, para); });
      const exp2 = e.exp.map((h) => { const para = destinoDe.get(h); if (!para) return h; const n = { ...h, ...para }; movidas.add(n); return n; });
      const moverHa: MoverHa[] = [];
      const ocupadasHa = new Set<string>();
      for (let i = 0; i < ciclo.length; i++) {
        const saiDe = ciclo[i]!, para = ciclo[(i + 1) % ciclo.length]!;
        for (const h of blocos[i]!) {
          if (h.professorId == null) continue;
          if (travaEm(h.professorId, turma.turno, para)) return null;
          const ha = haMovelEm(h.professorId, turma.turno, para);
          if (!ha) continue;
          if (moverHa.some((m) => m.professorId === h.professorId && mesma(m.de, para))) continue; // dupla do mesmo professor
          const destino = destinoDaHaMovel({ indisponiveis: e.indisponiveis, indisp, temAula: (p, t, c) => temAula(exp2, p, t, c),
            prof: h.professorId, turno: turma.turno, de: para, liberada: saiDe, horarios, ocupadasHa });
          if (!destino) return null;
          ocupadasHa.add(k4(h.professorId, turma.turno, destino.diaSemana, destino.numeroAula));
          moverHa.push({ professorId: h.professorId, turno: turma.turno, de: para, para: destino, motivo: ha.motivo ?? null });
        }
      }
      const depois = calcularChoques(exp2);
      if (depois.length > choquesAntes) return null;
      if (depois.some((d) => movidas.has(d.a as AulaExp) || movidas.has(d.b as AulaExp))) return null;
      // janelas dos professores que mudaram, nos dias mexidos
      const profs = new Set<number>();
      for (const b of blocos) for (const h of b) if (h.professorId != null) profs.add(h.professorId);
      const dias = new Set<number>([...ciclo.map((c) => c.diaSemana), ...moverHa.map((m) => m.para.diaSemana)]);
      const haSai = new Set(moverHa.map((m) => k4(m.professorId, m.turno, m.de.diaSemana, m.de.numeroAula)));
      let jAntes = 0, jDepois = 0;
      for (const p of profs) for (const d of dias) {
        jAntes += janelas(e.exp, new Set(), new Set(), p, turma.turno, d, horarios);
        jDepois += janelas(exp2, ocupadasHa, haSai, p, turma.turno, d, horarios);
      }
      return { blocos, moverHa, janelasAMais: jDepois - jAntes };
    };
    const descr = (bloco: AulaExp[]) => {
      const h = bloco[0]!;
      const profs = [...new Set(bloco.map((x) => (x.professorId != null ? e.nomeProfessor(x.professorId) : "sem professor")))].join(" + ");
      return `${e.nomeDisciplina(h.disciplinaId)} (${profs})`;
    };
    const registrar = (ciclo: Celula[]) => {
      const r = avaliar(ciclo);
      if (!r) return;
      const passos = ciclo.map((c, i) => {
        const b = r.blocos[i]!;
        return b.length ? `${descr(b)} da ${onde(c)} vai para a ${onde(ciclo[(i + 1) % ciclo.length]!)}` : null;
      }).filter(Boolean);
      let t = `${nomeT(turmaId)}: ${passos.join("; ")}`;
      if (ciclo.length === 2 && !r.blocos[1]!.length) t += " (horário vago)";
      if (r.moverHa.length) t += `; e a HA de ${r.moverHa.map((m) => `${e.nomeProfessor(m.professorId)} vai da ${onde(m.de)} para a ${onde(m.para)}`).join("; a de ")}`;
      if (r.janelasAMais > 0) t += ` (abre ${r.janelasAMais} janela${r.janelasAMais > 1 ? "s" : ""})`;
      const nota = Math.max(0, r.janelasAMais) * 1000 + r.moverHa.length * 100 + (ciclo.length - 2) * 50
        + ciclo.filter((c) => c.diaSemana !== A.diaSemana).length * 5 + (ciclo.length === 2 && r.blocos[1]!.length ? 1 : 0);
      opcoes.push({ turmaId, ciclo, texto: t, ...(r.moverHa.length ? { moverHa: r.moverHa } : {}), ...(r.janelasAMais > 0 ? { janelasAMais: r.janelasAMais } : {}), nota });
    };
    // ciclo de 2 (troca ou horario vago)
    for (const X of celulas) if (livreDeFixa(X)) registrar([A, X]);
    // ciclo de 3: so com aulas nos dois horarios (com vago, a troca de 2 ja cobre); professor do alvo livre em X
    for (const X of celulas) {
      if (!livreDeFixa(X) || !naCelula(X).length) continue;
      if (travaEm(alvo.professorId, turma.turno, X)) continue;
      for (const Y of celulas) {
        if (mesma(X, Y) || !livreDeFixa(Y) || !naCelula(Y).length) continue;
        registrar([A, X, Y]);
      }
    }
    opcoes.sort((x, y) => x.nota - y.nota || x.ciclo.length - y.ciclo.length
      || x.ciclo[1]!.diaSemana - y.ciclo[1]!.diaSemana || x.ciclo[1]!.numeroAula - y.ciclo[1]!.numeroAula);
    resultado.push({ texto, opcoes: opcoes.slice(0, limite).map(({ nota: _n, ...o }) => o) });
  }
  return resultado;
}

/** Mesma opcao (turma, ciclo e as mesmas HA movidas)? A rota so aplica o que ela mesma sugere agora. */
export function mesmaOpcaoCiclo(a: Pick<OpcaoCiclo, "turmaId" | "ciclo" | "moverHa">, b: Pick<OpcaoCiclo, "turmaId" | "ciclo" | "moverHa">): boolean {
  const ha = (o: Pick<OpcaoCiclo, "moverHa">) => (o.moverHa ?? []).map((m) => `${m.professorId}|${m.turno}|${m.de.diaSemana}-${m.de.numeroAula}|${m.para.diaSemana}-${m.para.numeroAula}`).sort().join(";");
  return a.turmaId === b.turmaId && a.ciclo.length === b.ciclo.length && a.ciclo.every((c, i) => mesma(c, b.ciclo[i]!)) && ha(a) === ha(b);
}
