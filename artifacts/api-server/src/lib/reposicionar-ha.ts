// [HA-MOVEL-MELHORIA] (21/10/2026) Reposiciona a HA MOVEL (automatica ou importada de outro
// sistema, ver ehHAMovel) de cada professor para os horarios que tiram janela, SEM mexer em aula.
// Motivo: no Arlinda (grade do Urania), a manha tinha 11 janelas; o "Melhorar" mexia 25 aulas para
// chegar a 3, mas so mudando a HA de lugar dava 0. O "Melhorar" agora tenta isto ANTES de mexer em aula.
// Regras:
//  - so move HA movel; HA fixa, probatorio e HA manual ficam onde estao (e ocupam o horario);
//  - a quantidade de HA de cada professor em cada turno nao muda;
//  - so vai para dia em que o professor ja tem aula naquele turno, em horario letivo livre
//    (sem aula, sem HA, sem bloqueio), com no maximo 3 HA no dia;
//  - nao usa a ultima aula do turno quando o professor tem aula na 1a do turno seguinte no mesmo dia;
//  - so move quando a janela do professor DIMINUI (empate: fica onde esta).
// Janela contada como no simulador e na tela de Conflitos: aula e HA ocupam; "atividade fora de sala"
// ("(ocupado: FOR)"...) entre elas nao conta como janela.
import { ehHAMovel } from "./ha-contraturno";

export interface AulaPos { professorId: number; turno: string; diaSemana: number; numeroAula: number }
export interface DispLinha {
  professorId: number; turno: string | null; diaSemana: number; horarioSlot: number;
  disponivel: boolean; horaAtividadeObrigatoria: boolean; motivo: string | null;
}
export interface MovimentoHA<T extends DispLinha = DispLinha> { linha: T; diaSemana: number; horarioSlot: number }

const PARES_TURNO: Array<[string, string]> = [["matutino", "vespertino"], ["vespertino", "noturno"]];
const MAX_HA_DIA = 3;
const RE_ATIVIDADE = /\(ocupado:\s*[^)]+\)/;

/**
 * Devolve os movimentos de HA (linha de hoje -> novo dia/horario) para os professores e turnos pedidos.
 * Nao grava nada. `slotsLetivos`: turno -> numeros de aula letivos (ex.: matutino -> [1..6]).
 */
export function reposicionarHAMovel<T extends DispLinha>(opts: {
  aulas: AulaPos[];
  disp: T[];
  slotsLetivos: Map<string, number[]>;
  turnos: string[];
  professores: Iterable<number>;
}): MovimentoHA<T>[] {
  const { aulas, disp, slotsLetivos, turnos } = opts;
  const movimentos: MovimentoHA<T>[] = [];
  const profs = new Set(opts.professores);

  for (const p of profs) {
    const aulasP = aulas.filter((a) => a.professorId === p);
    for (const turno of turnos) {
      const letivos = slotsLetivos.get(turno) ?? [];
      if (!letivos.length) continue;
      const aulaSet = new Set(aulasP.filter((a) => a.turno === turno).map((a) => `${a.diaSemana}|${a.numeroAula}`));
      if (!aulaSet.size) continue;
      const diasComAula = new Set(aulasP.filter((a) => a.turno === turno).map((a) => a.diaSemana));
      const linhasP = disp.filter((d) => d.professorId === p && d.turno === turno);
      const atividade = new Set(linhasP.filter((d) => !d.horaAtividadeObrigatoria && RE_ATIVIDADE.test(d.motivo ?? "")).map((d) => `${d.diaSemana}|${d.horarioSlot}`));
      const bloqueado = new Set(linhasP.filter((d) => !d.horaAtividadeObrigatoria && !d.disponivel).map((d) => `${d.diaSemana}|${d.horarioSlot}`));
      // posicao atual de cada HA (as moveis mudam durante a busca)
      const has = linhasP.filter((d) => d.horaAtividadeObrigatoria).map((d) => ({ linha: d, movel: ehHAMovel(d.motivo), dia: d.diaSemana, aula: d.horarioSlot }));
      const moveis = has.filter((h) => h.movel);
      if (!moveis.length) continue;

      // [INTERVALO-ENTRE-TURNOS] ultima aula do turno fica vaga se ha aula na 1a do turno seguinte
      const vagaIntervalo = new Set<number>();
      for (const [ant, seg] of PARES_TURNO) {
        const letSeg = slotsLetivos.get(seg);
        if (ant !== turno || !letSeg?.length) continue;
        const primeiraSeg = Math.min(...letSeg);
        for (const a of aulasP) if (a.turno === seg && a.numeroAula === primeiraSeg) vagaIntervalo.add(a.diaSemana);
      }
      const ultimaLetiva = Math.max(...letivos);

      const ocupadoDia = (dia: number) => {
        const s = new Set<number>();
        for (const k of aulaSet) { const [d, a] = k.split("|").map(Number); if (d === dia) s.add(a!); }
        for (const h of has) if (h.dia === dia) s.add(h.aula);
        return s;
      };
      const janelasDia = (dia: number) => {
        const s = ocupadoDia(dia);
        if (s.size < 2) return 0;
        const nums = [...s].sort((x, y) => x - y);
        let j = 0;
        for (let a = nums[0]! + 1; a < nums[nums.length - 1]!; a++) if (!s.has(a) && !atividade.has(`${dia}|${a}`)) j++;
        return j;
      };
      const haNoDia = (dia: number) => has.filter((h) => h.dia === dia).length;

      for (let iter = 0; iter < 200; iter++) {
        let melhor: { h: (typeof moveis)[number]; dia: number; aula: number; ganho: number; dist: number } | null = null;
        for (const h of moveis) {
          for (const dia of diasComAula) {
            if (dia !== h.dia && haNoDia(dia) >= MAX_HA_DIA) continue;
            for (const a of letivos) {
              if (dia === h.dia && a === h.aula) continue;
              const k = `${dia}|${a}`;
              if (aulaSet.has(k) || bloqueado.has(k) || has.some((x) => x.dia === dia && x.aula === a)) continue;
              if (a === ultimaLetiva && vagaIntervalo.has(dia)) continue;
              const antes = janelasDia(h.dia) + (dia !== h.dia ? janelasDia(dia) : 0);
              const [d0, a0] = [h.dia, h.aula];
              h.dia = dia; h.aula = a;
              const depois = janelasDia(d0) + (dia !== d0 ? janelasDia(dia) : 0);
              h.dia = d0; h.aula = a0;
              const ganho = antes - depois;
              if (ganho <= 0) continue;
              const dist = (dia === d0 ? 0 : 10) + Math.abs(a - a0);
              if (!melhor || ganho > melhor.ganho || (ganho === melhor.ganho && dist < melhor.dist)) melhor = { h, dia, aula: a, ganho, dist };
            }
          }
        }
        if (!melhor) break;
        melhor.h.dia = melhor.dia;
        melhor.h.aula = melhor.aula;
      }
      for (const h of moveis) {
        if (h.dia !== h.linha.diaSemana || h.aula !== h.linha.horarioSlot) movimentos.push({ linha: h.linha, diaSemana: h.dia, horarioSlot: h.aula });
      }
    }
  }
  return movimentos;
}

/** Slots letivos por turno a partir de horario_slots (uniao dos niveis de ensino). */
export function slotsLetivosPorTurno(slots: Array<{ turno: string; numeroAula: number; letivo?: boolean | null }>): Map<string, number[]> {
  const m = new Map<string, Set<number>>();
  for (const s of slots) {
    if (s.letivo === false || !s.turno) continue;
    if (!m.has(s.turno)) m.set(s.turno, new Set());
    m.get(s.turno)!.add(s.numeroAula);
  }
  return new Map([...m].map(([t, s]) => [t, [...s].sort((a, b) => a - b)]));
}
