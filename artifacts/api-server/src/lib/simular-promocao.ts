// [SIMULAR-PROMOCAO] (05/10/2026) Antes de promover um experimento: monta em
// MEMORIA a grade oficial como ficaria depois da promocao (mesma regra do
// promover, lib/promocao-substitui.ts: troca as aulas dos pares turma+professor do experimento e a de quem
// deixou a disciplina), roda o
// MESMO calculo de HA da promocao (calcularHAIdeal com aulasOverride, sem gravar)
// e conta as janelas de professor dos turnos envolvidos do jeito da tela de
// Conflitos: aula, HA e atividade do sistema anterior ("(ocupado: FORM)"...) ocupam o
// horario. Compara com a oficial atual. Nada e gravado.
import { regraDeSubstituicao, vinculosDasTurmas } from "./promocao-substitui"; // [PROMOVER-PROFESSOR-TROCADO]
import { db, professoresTable, turmasTable, horariosTable, horariosExperimentaisTable, disponibilidadeTable, disciplinasTable, horarioSlotsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { calcularHAIdeal, type AulaParaCalculoHA, type MarcaHACalculada } from "./recalcular-ha";
import { reposicionarHAMovel, slotsLetivosPorTurno, type AulaPos } from "./reposicionar-ha";
import { MOTIVO_HA_AUTO } from "./ha-contraturno"; // [HA-BURACO-QUEM-MUDOU]
import { mapaIntegralDosSlots, posicaoReal } from "./turno-integral"; // [INTEGRAL-NA-OCUPACAO]

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

export interface JanelaSimulada {
  professorId: number;
  professorNome: string;
  turno: string;
  dia: string;
  diaSemana: number; // [FECHAR-JANELA] 0 = segunda
  janelas: number;
  dia_detalhe: string; // ex.: "3:aula 5:HA 6:aula"
}

// [SIMULAR-MUDANCA-REAL] (21/10/2026) o que muda de verdade na grade ao promover
export interface AulaMovida {
  professorNome: string;
  turma: string;
  disciplina: string;
  sai: string[];   // ex.: ["Seg 4ª"] (horários da oficial que deixam de ter essa aula)
  entra: string[]; // ex.: ["Seg 2ª"]
}
export interface HAMovida {
  professorNome: string;
  sai: string[];   // HA de hoje que sai (ex.: "Manhã Seg 3ª")
  entra: string[]; // HA que entra
}

export interface ResultadoSimulacao {
  nome: string;
  turnos: string[];
  /** oficial como está HOJE (HA gravada de verdade: automática, manual, fixa, importada) */
  oficialHoje: { janelas: number; diasComConflito: number; detalhe: JanelaSimulada[] };
  /** oficial com a HA recalculada pela regra (o que o recálculo faria sem promover) */
  oficial: { janelas: number; diasComConflito: number; detalhe: JanelaSimulada[] };
  experimento: { janelas: number; diasComConflito: number; detalhe: JanelaSimulada[] };
  professoresComHAMudando: number;
  aulasMudando: number;
  aulasMovidas: AulaMovida[];
  haMovidas: HAMovida[];
  /** experimento (depois de promover) comparado com a oficial de HOJE */
  veredito: "melhor" | "empate" | "pior";
  /** [PDF-HA-DA-SIMULACAO] HA de cada professor, em TODOS os turnos, como a promocao vai gravar (para o PDF do
   * experimento). Fica fora da resposta da rota /simulacao. */
  haDepoisPromover: MarcaHACalculada[];
}

// [FECHAR-JANELA] expOverride: linhas do experimento com trocas feitas em memória (para avaliar uma troca sem gravar)
export async function simularPromocao(
  escolaId: string,
  nome: string,
  expOverride?: Array<typeof horariosExperimentaisTable.$inferSelect>,
): Promise<ResultadoSimulacao | null> {
  const [profs, turmas, oficial, expDoBanco, disp, discs, slots] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(horariosExperimentaisTable)
      .where(and(eq(horariosExperimentaisTable.escolaId, escolaId), eq(horariosExperimentaisTable.nome, nome))),
    db.select().from(disponibilidadeTable),
    db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome }).from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);
  const exp = expOverride ?? expDoBanco;
  if (exp.length === 0) return null;
  // [DISCIPLINA-NOME] parte das disciplinas e do catálogo comum (escola_id "escola_default"): busca também por id
  const idsDisc = [...new Set([...exp, ...oficial].map((x) => x.disciplinaId))].filter((id) => !discs.some((d) => d.id === id));
  if (idsDisc.length) discs.push(...await db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome }).from(disciplinasTable).where(inArray(disciplinasTable.id, idsDisc)));

  const nomeProf = new Map(profs.map((p) => [p.id, p.nome]));
  const profIds = new Set(profs.map((p) => p.id));
  const turnoDe = new Map(turmas.map((t) => [t.id, t.turno]));
  // [INTEGRAL-NA-OCUPACAO] aula de turma integral conta no turno e na aula REAIS (manha/tarde)
  const mapaInt = mapaIntegralDosSlots(slots);
  const real = (a: { turmaId: number; numeroAula: number }) => posicaoReal(a.turmaId, a.numeroAula, turnoDe, mapaInt);
  const turnos = [...new Set(exp.map((e) => real(e)?.turno).filter((t): t is string => !!t))];

  // mesma regra do promover: os pares turma+professor do experimento e a aula de quem deixou a disciplina
  const substitui = regraDeSubstituicao(exp, await vinculosDasTurmas([...new Set(exp.map((e) => e.turmaId))])); // [PROMOVER-PROFESSOR-TROCADO]
  const aulasOficial: AulaParaCalculoHA[] = oficial.map((h) => ({ professorId: h.professorId, turmaId: h.turmaId, diaSemana: h.diaSemana, numeroAula: h.numeroAula }));
  const aulasSimuladas: AulaParaCalculoHA[] = [
    ...oficial.filter((h) => !substitui(h)).map((h) => ({ professorId: h.professorId, turmaId: h.turmaId, diaSemana: h.diaSemana, numeroAula: h.numeroAula })),
    ...exp.map((e) => ({ professorId: e.professorId, turmaId: e.turmaId, diaSemana: e.diaSemana, numeroAula: e.numeroAula })),
  ];
  const haOficial = await calcularHAIdeal(escolaId, aulasOficial);
  const haSimulada = await calcularHAIdeal(escolaId, aulasSimuladas);

  const atividade = new Set(disp
    .filter((d) => profIds.has(d.professorId) && !d.horaAtividadeObrigatoria && d.turno && /\(ocupado:\s*[^)]+\)/.test(d.motivo ?? ""))
    .map((d) => `${d.professorId}|${d.turno}|${d.diaSemana}|${d.horarioSlot}`));

  const contar = (aulas: AulaParaCalculoHA[], ha: MarcaHACalculada[]) => {
    const porDia = new Map<string, Map<number, string>>(); // "prof|turno|dia" -> aula -> tipo
    const marca = (p: number, t: string, d: number, a: number, tipo: string) => {
      const k = `${p}|${t}|${d}`;
      if (!porDia.has(k)) porDia.set(k, new Map());
      if (!porDia.get(k)!.has(a) || tipo === "aula") porDia.get(k)!.set(a, tipo);
    };
    for (const a of aulas) {
      const r = real(a); // [INTEGRAL-NA-OCUPACAO]
      if (r && turnos.includes(r.turno)) marca(a.professorId, r.turno, a.diaSemana, r.numeroAula, "aula");
    }
    for (const m of ha) if (turnos.includes(m.turno)) marca(m.professorId, m.turno, m.diaSemana, m.horarioSlot, m.outroTurno ? "HA*" : "HA");

    const detalhe: JanelaSimulada[] = [];
    for (const [k, m] of porDia) {
      const [p, t, d] = k.split("|");
      const nums = [...m.keys()].sort((x, y) => x - y);
      let janelas = 0;
      for (let a = nums[0]! + 1; a < nums[nums.length - 1]!; a++) if (!m.has(a) && !atividade.has(`${p}|${t}|${d}|${a}`)) janelas++;
      if (janelas > 0) {
        detalhe.push({
          professorId: Number(p), professorNome: nomeProf.get(Number(p)) ?? `#${p}`, turno: t!, dia: DIAS[Number(d)] ?? d!, diaSemana: Number(d),
          janelas, dia_detalhe: nums.map((a) => `${a}:${m.get(a)}`).join(" "),
        });
      }
    }
    detalhe.sort((x, y) => y.janelas - x.janelas || x.professorNome.localeCompare(y.professorNome));
    return {
      janelas: detalhe.reduce((s, d) => s + d.janelas, 0),
      diasComConflito: detalhe.filter((d) => d.janelas >= 2).length, // mesmo corte da tela de Conflitos
      detalhe,
    };
  };

  // [SIMULAR-MUDANCA-REAL] HA gravada hoje (qualquer tipo), nos turnos do experimento
  const haHoje: MarcaHACalculada[] = disp
    .filter((d) => profIds.has(d.professorId) && d.horaAtividadeObrigatoria && d.turno && turnos.includes(d.turno))
    .map((d) => ({ professorId: d.professorId, turno: d.turno!, diaSemana: d.diaSemana, horarioSlot: d.horarioSlot, outroTurno: /outro turno|HA\*/i.test(d.motivo ?? "") }));

  const resOficialHoje = contar(aulasOficial, haHoje);
  const resOficial = contar(aulasOficial, haOficial);

  const TURNO_ROT: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
  const rotulo = (d: number, a: number) => `${DIAS[d] ?? d} ${a}ª`;

  // HA: hoje x depois de promover, só nos turnos do experimento
  const chave = (m: MarcaHACalculada) => `${m.professorId}|${m.turno}|${m.diaSemana}|${m.horarioSlot}`;
  // [HA-SO-QUEM-MUDOU] igual a promocao: quem nao teve aula mexida fica com a HA de hoje
  const chaveAulaP = (x: { turmaId: number; diaSemana: number; numeroAula: number }) => `${x.turmaId}|${x.diaSemana}|${x.numeroAula}`;
  const porProf = (rows: AulaParaCalculoHA[]) => {
    const m = new Map<number, Set<string>>();
    for (const r of rows) { if (!m.has(r.professorId)) m.set(r.professorId, new Set()); m.get(r.professorId)!.add(chaveAulaP(r)); }
    return m;
  };
  const antesP = porProf(aulasOficial); const depoisP = porProf(aulasSimuladas);
  const mudou = new Set<number>();
  for (const p of new Set([...antesP.keys(), ...depoisP.keys()])) {
    const a = antesP.get(p) ?? new Set<string>(); const d = depoisP.get(p) ?? new Set<string>();
    if (a.size !== d.size || [...a].some((k) => !d.has(k))) mudou.add(p);
  }
  // [HA-MOVEL-MELHORIA] quem nao teve aula mexida: a HA movel vai para onde tira janela (igual a promocao)
  const aulasSimPos: AulaPos[] = aulasSimuladas.flatMap((a) => {
    const r = real(a); // [INTEGRAL-NA-OCUPACAO] a HA nunca vai para cima de aula da turma integral
    return r ? [{ professorId: a.professorId, turno: r.turno, diaSemana: a.diaSemana, numeroAula: r.numeroAula }] : [];
  });
  const dispEscola = disp.filter((d) => profIds.has(d.professorId));
  const movHA = reposicionarHAMovel({
    aulas: aulasSimPos, disp: dispEscola, slotsLetivos: slotsLetivosPorTurno(slots), turnos,
    professores: [...profIds].filter((p) => !mudou.has(p)),
  });
  const novoLugar = new Map(movHA.map((m) => [m.linha, m]));
  const haHojeReposta: MarcaHACalculada[] = dispEscola
    .filter((d) => d.horaAtividadeObrigatoria && d.turno && turnos.includes(d.turno) && !mudou.has(d.professorId))
    .map((d) => {
      const mv = novoLugar.get(d);
      return { professorId: d.professorId, turno: d.turno!, diaSemana: mv ? mv.diaSemana : d.diaSemana, horarioSlot: mv ? mv.horarioSlot : d.horarioSlot, outroTurno: /outro turno|HA\*/i.test(d.motivo ?? "") };
    });
  // [HA-BURACO-QUEM-MUDOU] (01/11/2026) quem teve aula mexida: depois do recalculo, a HA movel tambem vai para onde
  // tira janela (igual a promocao). Antes so quem NAO mudou passava por isso, e o recalculo mantinha a HA importada
  // onde estava: sobravam janelas que uma HA movida fecharia (Bruno Carvalho, simulacao de 01/11).
  const haRecalculada = haSimulada.filter((m) => turnos.includes(m.turno) && mudou.has(m.professorId));
  const linhaHoje = new Map(dispEscola.filter((d) => d.horaAtividadeObrigatoria).map((d) => [`${d.professorId}|${d.turno}|${d.diaSemana}|${d.horarioSlot}`, d]));
  const haRecalcLinhas = haRecalculada.map((m) => ({
    professorId: m.professorId, turno: m.turno, diaSemana: m.diaSemana, horarioSlot: m.horarioSlot,
    disponivel: true, horaAtividadeObrigatoria: true, marca: m,
    // a HA que ja existia fica com o motivo dela (manual/fixa continuam presas); a nova e automatica
    motivo: linhaHoje.get(`${m.professorId}|${m.turno}|${m.diaSemana}|${m.horarioSlot}`)?.motivo ?? MOTIVO_HA_AUTO,
  }));
  const movRecalc = reposicionarHAMovel({
    aulas: aulasSimPos, slotsLetivos: slotsLetivosPorTurno(slots), turnos, professores: [...mudou],
    disp: [...dispEscola.filter((d) => mudou.has(d.professorId) && !d.horaAtividadeObrigatoria), ...haRecalcLinhas],
  });
  const lugarRecalc = new Map(movRecalc.map((mv) => [mv.linha, mv]));
  const haDepois = [
    ...haRecalcLinhas.map((l) => {
      const mv = lugarRecalc.get(l);
      return mv ? { ...l.marca, diaSemana: mv.diaSemana, horarioSlot: mv.horarioSlot } : l.marca;
    }),
    ...haHojeReposta,
  ];
  const resExp = contar(aulasSimuladas, haDepois);
  const sHoje = new Set(haHoje.map(chave));
  const sDepois = new Set(haDepois.map(chave));
  const haPorProf = new Map<number, { sai: string[]; entra: string[] }>();
  const addHA = (m: MarcaHACalculada, lado: "sai" | "entra") => {
    if (!haPorProf.has(m.professorId)) haPorProf.set(m.professorId, { sai: [], entra: [] });
    haPorProf.get(m.professorId)![lado].push(`${TURNO_ROT[m.turno] ?? m.turno} ${rotulo(m.diaSemana, m.horarioSlot)}`);
  };
  for (const m of haHoje) if (!sDepois.has(chave(m))) addHA(m, "sai");
  for (const m of haDepois) if (!sHoje.has(chave(m))) addHA(m, "entra");
  const haMovidas: HAMovida[] = [...haPorProf.entries()]
    .map(([p, v]) => ({ professorNome: nomeProf.get(p) ?? `#${p}`, ...v }))
    .sort((a, b) => a.professorNome.localeCompare(b.professorNome, "pt-BR"));

  // aulas: o que sai e o que entra, por professor + turma + disciplina (só os pares que a promoção troca)
  const nomeTurma = new Map(turmas.map((t) => [t.id, t.nome]));
  const nomeDisc = new Map(discs.map((d) => [d.id, d.nome]));
  const grupo = new Map<string, { p: number; t: number; d: number; of: Set<string>; ex: Set<string> }>();
  const g = (p: number, t: number, d: number) => {
    const k = `${p}|${t}|${d}`;
    if (!grupo.has(k)) grupo.set(k, { p, t, d, of: new Set(), ex: new Set() });
    return grupo.get(k)!;
  };
  for (const h of oficial) if (substitui(h)) g(h.professorId, h.turmaId, h.disciplinaId).of.add(`${h.diaSemana}|${h.numeroAula}`);
  for (const e of exp) g(e.professorId, e.turmaId, e.disciplinaId).ex.add(`${e.diaSemana}|${e.numeroAula}`);
  const lbl = (k: string) => { const [d, a] = k.split("|").map(Number); return rotulo(d!, a!); };
  const ordem = (a: string, b: string) => a.localeCompare(b);
  const aulasMovidas: AulaMovida[] = [];
  let aulasMudando = 0;
  for (const x of grupo.values()) {
    const sai = [...x.of].filter((k) => !x.ex.has(k)).sort(ordem);
    const entra = [...x.ex].filter((k) => !x.of.has(k)).sort(ordem);
    if (sai.length === 0 && entra.length === 0) continue;
    aulasMudando += Math.max(sai.length, entra.length);
    aulasMovidas.push({
      professorNome: nomeProf.get(x.p) ?? `#${x.p}`, turma: nomeTurma.get(x.t) ?? `#${x.t}`, disciplina: nomeDisc.get(x.d) ?? `#${x.d}`,
      sai: sai.map(lbl), entra: entra.map(lbl),
    });
  }
  aulasMovidas.sort((a, b) => a.professorNome.localeCompare(b.professorNome, "pt-BR") || a.turma.localeCompare(b.turma, "pt-BR"));

  return {
    nome,
    turnos,
    oficialHoje: resOficialHoje,
    oficial: resOficial,
    experimento: resExp,
    professoresComHAMudando: haMovidas.length,
    aulasMudando,
    aulasMovidas,
    haMovidas,
    veredito: resExp.janelas < resOficialHoje.janelas ? "melhor" : resExp.janelas === resOficialHoje.janelas ? "empate" : "pior",
    // [PDF-HA-DA-SIMULACAO] (01/11/2026) nos turnos do experimento, a HA acima (com a HA no buraco); fora deles, igual a
    // promocao: quem teve aula mexida fica com a HA recalculada e quem nao teve, com a HA de hoje.
    haDepoisPromover: [
      ...haDepois,
      ...haSimulada.filter((m) => !turnos.includes(m.turno) && mudou.has(m.professorId)),
      ...dispEscola
        .filter((d) => d.horaAtividadeObrigatoria && d.turno && !turnos.includes(d.turno) && !mudou.has(d.professorId))
        .map((d) => ({ professorId: d.professorId, turno: d.turno!, diaSemana: d.diaSemana, horarioSlot: d.horarioSlot, outroTurno: /outro turno|HA\*/i.test(d.motivo ?? "") })),
    ],
  };
}
