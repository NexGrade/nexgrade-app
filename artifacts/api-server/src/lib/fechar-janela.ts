// [FECHAR-JANELA] (22/10/2026) "Fechar esta janela" na simulação de promoção de um experimento.
// Para um professor com horário vago entre atividades num dia, procura TROCAS de aula DENTRO do
// experimento (nunca mexe na oficial): uma aula dele na mesma turma vai para o buraco e a aula que
// estava no buraco (de outro professor) vai para o lugar que ele deixou.
// Regras da troca:
//  - só aula comum: nada de aula fixa, assíncrona ou dupla docência (duas linhas no mesmo horário da turma);
//  - os dois professores precisam estar livres no horário novo (sem aula em outra turma do turno,
//    sem bloqueio, sem HA que não se move: fixa, probatório, manual, atividade fora de sala);
//  - a turma não fica com mais aulas da disciplina no dia do que já tem no dia mais cheio dela no
//    experimento (o motor já respeitou o limite; não passamos dele) e o professor também não;
//  - não cria "pausa entre turnos" (última da manhã + 1ª da tarde no mesmo dia).
// Primeiro um filtro rápido (aulas + HA que não se move); as melhores vão para a simulação completa
// (mesma conta do botão "Simular promoção", com a HA recalculada) e só ficam as que baixam as janelas.
import { sobreporExperimento } from "./disponibilidade-experimento"; // [DISP-EXPERIMENTAL]
import { db, horariosTable, horariosExperimentaisTable, turmasTable, disponibilidadeTable, professoresTable, disciplinasTable, horarioSlotsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { ehHAMovel } from "./ha-contraturno";
import { limitesLetivosPorTurno } from "./intervalo-entre-turnos";
import { simularPromocao } from "./simular-promocao";
import { regraDeSubstituicao, vinculosDasTurmas } from "./promocao-substitui"; // [PROMOVER-PROFESSOR-TROCADO]
import { mapaIntegralDosSlots, posicaoReal, TURNO_INTEGRAL } from "./turno-integral"; // [INTEGRAL-NA-OCUPACAO]

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const RE_ATIVIDADE = /\(ocupado:\s*[^)]+\)/;

export interface OpcaoTroca {
  /** uma linha de cada bloco do ciclo, na ordem: o 1º vai para o lugar do 2º, ..., o último para o lugar do 1º */
  ids: number[];
  turma: string;
  passos: string[];
  texto: string;
  janelasDepois: number;
}

type LinhaExp = typeof horariosExperimentaisTable.$inferSelect;

export async function opcoesFecharJanela(
  escolaId: string,
  nome: string,
  professorId: number,
  turno: string,
  dia: number,
  maxOpcoes = 3,
  /** só confere se esta troca ainda é válida (antes de gravar); não roda a simulação completa */
  validar?: { ids: number[] },
): Promise<{ janelasAntes: number; opcoes: OpcaoTroca[]; valida?: boolean } | null> {
  const [exp, oficial, turmas, profs] = await Promise.all([
    db.select().from(horariosExperimentaisTable).where(and(eq(horariosExperimentaisTable.escolaId, escolaId), eq(horariosExperimentaisTable.nome, nome))),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select({ id: professoresTable.id, nome: professoresTable.nome }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
  ]);
  if (exp.length === 0) return null;
  // [DISCIPLINA-NOME] por id: parte das disciplinas e do catálogo comum (escola_id "escola_default")
  const discs = await db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome }).from(disciplinasTable)
    .where(inArray(disciplinasTable.id, [...new Set(exp.map((e) => e.disciplinaId))]));

  const turnoDe = new Map(turmas.map((t) => [t.id, t.turno]));
  const nomeTurma = new Map(turmas.map((t) => [t.id, t.nome]));
  const nomeProf = new Map(profs.map((p) => [p.id, p.nome]));
  const nomeDisc = new Map(discs.map((d) => [d.id, d.nome]));
  const limites = await limitesLetivosPorTurno(escolaId as never);

  // grade como fica depois de promover (mesma regra do promover), só o turno pedido
  const substitui = regraDeSubstituicao(exp, await vinculosDasTurmas([...new Set(exp.map((e) => e.turmaId))])); // [PROMOVER-PROFESSOR-TROCADO]
  type Aula = { id: number | null; professorId: number; turmaId: number; disciplinaId: number; dia: number; aula: number; turno: string };
  // [INTEGRAL-NA-OCUPACAO] (01/11/2026) aula da turma integral ocupa o professor no turno e na aula REAIS (manha/tarde).
  // Aqui ela fica fixa (id null): mover exigiria a numeracao do integral, e a troca so mexe no turno pedido.
  const mapaInt = mapaIntegralDosSlots(await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)));
  const naPosicaoReal = (id: number | null, h: { professorId: number; turmaId: number; disciplinaId: number; diaSemana: number; numeroAula: number }): Aula => {
    const r = posicaoReal(h.turmaId, h.numeroAula, turnoDe, mapaInt);
    const integral = turnoDe.get(h.turmaId) === TURNO_INTEGRAL;
    return { id: integral ? null : id, professorId: h.professorId, turmaId: h.turmaId, disciplinaId: h.disciplinaId, dia: h.diaSemana, aula: r?.numeroAula ?? h.numeroAula, turno: r?.turno ?? "" };
  };
  const aulasTodas: Aula[] = [
    ...oficial.filter((h) => !substitui(h)).map((h) => naPosicaoReal(null, h)),
    ...exp.map((e) => naPosicaoReal(e.id, e)),
  ];
  const aulasTurno = aulasTodas.filter((a) => a.turno === turno);

  // horários travados de cada professor (bloqueio, HA que não se move, atividade fora de sala)
  const profIds = [...new Set(aulasTurno.map((a) => a.professorId))];
  const disp = profIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds))
      .then((r) => sobreporExperimento(r, (d) => profIds.includes(d.professorId))) // [DISP-EXPERIMENTAL]
    : [];
  const travado = new Set<string>();
  const haFixa = new Set<string>();
  for (const d of disp) {
    if (d.turno !== turno) continue;
    const k = `${d.professorId}|${d.diaSemana}|${d.horarioSlot}`;
    if (d.horaAtividadeObrigatoria) { if (!ehHAMovel(d.motivo)) { travado.add(k); haFixa.add(k); } }
    else if (!d.disponivel || RE_ATIVIDADE.test(d.motivo ?? "")) travado.add(k);
  }

  const ocupadoProf = (aulas: Aula[], p: number, dia: number) => {
    const s = new Set<number>();
    for (const a of aulas) if (a.professorId === p && a.dia === dia) s.add(a.aula);
    for (const k of haFixa) { const [pp, d, n] = k.split("|").map(Number); if (pp === p && d === dia) s.add(n!); }
    return s;
  };
  const janelasDia = (aulas: Aula[], p: number, dia: number) => {
    const s = ocupadoProf(aulas, p, dia);
    if (s.size < 2) return 0;
    const nums = [...s].sort((x, y) => x - y);
    let j = 0;
    for (let n = nums[0]! + 1; n < nums[nums.length - 1]!; n++) if (!s.has(n) && !travado.has(`${p}|${dia}|${n}`)) j++;
    return j;
  };

  // horários vagos do professor naquele dia, como a simulação mostra (aula + HA recalculada)
  const base = await simularPromocao(escolaId, nome);
  if (!base) return null;
  const linhaDia = base.experimento.detalhe.find((d) => d.professorId === professorId && d.turno === turno && d.diaSemana === dia);
  const ocupP = new Set((linhaDia?.dia_detalhe ?? "").split(" ").filter(Boolean).map((x) => Number(x.split(":")[0])));
  const numsP = [...ocupP].sort((x, y) => x - y);
  const buracos: number[] = [];
  for (let n = (numsP[0] ?? 0) + 1; n < (numsP[numsP.length - 1] ?? 0); n++) if (!ocupP.has(n) && !travado.has(`${professorId}|${dia}|${n}`)) buracos.push(n);

  const linhasNoHorario = (turmaId: number, d: number, n: number) => aulasTurno.filter((a) => a.turmaId === turmaId && a.dia === d && a.aula === n);
  const livre = (aulas: Aula[], p: number, d: number, n: number, ignorar: Set<number | null>) =>
    !travado.has(`${p}|${d}|${n}`) && !aulas.some((a) => a.professorId === p && a.dia === d && a.aula === n && !ignorar.has(a.id));
  // limite da turma+disciplina e do professor na turma: o maior que o experimento já tem num dia
  const maxNoDia = (filtro: (a: Aula) => boolean) => {
    const c = new Map<number, number>();
    for (const a of aulasTurno) if (filtro(a)) c.set(a.dia, (c.get(a.dia) ?? 0) + 1);
    return Math.max(0, ...c.values());
  };
  const contaNoDia = (aulas: Aula[], d: number, filtro: (a: Aula) => boolean) => aulas.filter((a) => a.dia === d && filtro(a)).length;
  // pausa entre turnos: última da manhã + 1ª da tarde no mesmo dia
  const manha = limites.get("matutino");
  const tarde = limites.get("vespertino");
  const criaPausa = (p: number, d: number, n: number) => {
    if (turno === "vespertino" && manha && tarde && n === tarde.primeira)
      return aulasTodas.some((a) => a.professorId === p && a.turno === "matutino" && a.dia === d && a.aula === manha.ultima);
    if (turno === "matutino" && manha && tarde && n === manha.ultima)
      return aulasTodas.some((a) => a.professorId === p && a.turno === "vespertino" && a.dia === d && a.aula === tarde.primeira);
    return false;
  };

  // [FECHAR-JANELA] a troca é entre BLOCOS: todas as linhas da turma no mesmo horário (dupla docência vai junta).
  // Ciclo de 2 (A <-> B) ou de 3 (A -> lugar de B, B -> lugar de C, C -> lugar de A), sempre na mesma turma.
  type Bloco = { linhas: LinhaExp[]; dia: number; aula: number };
  const blocoDe = (turmaId: number, d: number, n: number): Bloco | null => {
    const linhas = exp.filter((e) => e.turmaId === turmaId && e.diaSemana === d && e.numeroAula === n);
    if (linhas.length === 0) return null;
    // o horário inteiro da turma tem de estar no experimento (nada da oficial fica para trás)
    if (linhas.length !== linhasNoHorario(turmaId, d, n).length) return null;
    if (linhas.some((e) => e.fixa || e.assincrona)) return null;
    return { linhas, dia: d, aula: n };
  };
  const posicoesTurno = (() => {
    const s = new Set<string>();
    for (const a of aulasTurno) s.add(`${a.dia}|${a.aula}`);
    return [...s].map((k) => k.split("|").map(Number) as [number, number]);
  })();
  const avaliarCiclo = (ciclo: Bloco[]) => {
    const ignorar = new Set<number | null>(ciclo.flatMap((b) => b.linhas.map((e) => e.id)));
    const destino = (i: number) => ciclo[(i + 1) % ciclo.length]!;
    // cada bloco vai para o lugar do seguinte: todos os professores dele livres lá
    for (let i = 0; i < ciclo.length; i++) {
      const para = destino(i);
      if (!ciclo[i]!.linhas.every((e) => livre(aulasTurno, e.professorId, para.dia, para.aula, ignorar) && !criaPausa(e.professorId, para.dia, para.aula))) return null;
    }
    const novoLugar = new Map<number, { dia: number; aula: number }>();
    ciclo.forEach((b, i) => { const para = destino(i); for (const e of b.linhas) novoLugar.set(e.id, { dia: para.dia, aula: para.aula }); });
    const depois = aulasTurno.map((a) => { const n = a.id != null ? novoLugar.get(a.id) : undefined; return n ? { ...a, dia: n.dia, aula: n.aula } : a; });
    const okLimite = (x: LinhaExp, d: number) => {
      const disc = (a: Aula) => a.turmaId === x.turmaId && a.disciplinaId === x.disciplinaId;
      const prof = (a: Aula) => a.turmaId === x.turmaId && a.professorId === x.professorId;
      return contaNoDia(depois, d, disc) <= Math.max(1, maxNoDia(disc)) && contaNoDia(depois, d, prof) <= Math.max(1, maxNoDia(prof));
    };
    for (let i = 0; i < ciclo.length; i++) if (!ciclo[i]!.linhas.every((x) => okLimite(x, destino(i).dia))) return null;
    // filtro rápido (aulas + HA que não se move): descarta só o que claramente piora
    const envolvidos = [...new Set(ciclo.flatMap((b) => b.linhas.map((e) => e.professorId)))];
    const dias = [...new Set(ciclo.map((b) => b.dia))];
    const soma = (aulas: Aula[]) => dias.reduce((s, d) => s + envolvidos.reduce((t, p) => t + janelasDia(aulas, p, d), 0), 0);
    const delta = soma(depois) - soma(aulasTurno);
    if (delta > 0) return null;
    return { delta, novoLugar };
  };

  const candidatos: Array<{ ciclo: Bloco[]; delta: number; novoLugar: Map<number, { dia: number; aula: number }> }> = [];
  const minhasLinhas = exp.filter((e) => e.professorId === professorId && turnoDe.get(e.turmaId) === turno);
  const vistos = new Set<string>();
  for (const g of buracos) {
    for (const minha of minhasLinhas) {
      const A = blocoDe(minha.turmaId, minha.diaSemana, minha.numeroAula);
      const B = blocoDe(minha.turmaId, dia, g);
      if (!A || !B || B.linhas.some((e) => e.professorId === professorId)) continue;
      const kAB = `${minha.turmaId}|${A.dia}|${A.aula}|${B.dia}|${B.aula}`;
      if (vistos.has(kAB)) continue;
      vistos.add(kAB);
      // ciclo de 2: A <-> B
      const r2 = avaliarCiclo([A, B]);
      if (r2) candidatos.push({ ciclo: [A, B], ...r2 });
      // ciclo de 3: A -> lugar de B, B -> lugar de C, C -> lugar de A
      for (const [d, n] of posicoesTurno) {
        if ((d === A.dia && n === A.aula) || (d === B.dia && n === B.aula)) continue;
        const C = blocoDe(minha.turmaId, d, n);
        if (!C || C.linhas.some((e) => e.professorId === professorId)) continue;
        const r3 = avaliarCiclo([A, B, C]);
        if (r3) candidatos.push({ ciclo: [A, B, C], ...r3 });
      }
    }
  }
  candidatos.sort((x, y) => x.delta - y.delta || x.ciclo.length - y.ciclo.length);
  const idsDoCiclo = (c: { ciclo: Bloco[] }) => c.ciclo.map((b) => b.linhas[0]!.id);
  if (validar) {
    const alvo = validar.ids.join(",");
    return { janelasAntes: -1, opcoes: [], valida: candidatos.some((c) => idsDoCiclo(c).join(",") === alvo) };
  }

  // simulação completa (HA recalculada) das melhores; só fica o que baixa as janelas do experimento
  const opcoes: OpcaoTroca[] = [];
  const DIAN = (b: Bloco) => `${DIAS[b.dia]} ${b.aula}ª`;
  for (const c of candidatos.slice(0, 60)) {
    const trocado = exp.map((e) => { const n = c.novoLugar.get(e.id); return n ? { ...e, diaSemana: n.dia, numeroAula: n.aula } : e; });
    const sim = await simularPromocao(escolaId, nome, trocado);
    if (!sim || sim.experimento.janelas >= base.experimento.janelas) continue;
    const passos = c.ciclo.map((b, i) => {
      const para = c.ciclo[(i + 1) % c.ciclo.length]!;
      const x = b.linhas[0]!;
      const quem = [...new Set(b.linhas.map((e) => nomeProf.get(e.professorId) ?? String(e.professorId)))].join(" + ");
      return `${nomeDisc.get(x.disciplinaId) ?? x.disciplinaId} (${quem}): ${DIAN(b)} → ${DIAN(para)}`;
    });
    opcoes.push({ ids: idsDoCiclo(c), turma: nomeTurma.get(c.ciclo[0]!.linhas[0]!.turmaId) ?? "", passos, texto: passos.join("; "), janelasDepois: sim.experimento.janelas });
    if (opcoes.length >= maxOpcoes * 2) break;
  }
  opcoes.sort((x, y) => x.janelasDepois - y.janelasDepois);
  return { janelasAntes: base.experimento.janelas, opcoes: opcoes.slice(0, maxOpcoes) };
}
