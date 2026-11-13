// [AULA-EM-BLOQUEIO] (12/11/2026) Retorno do diretor do Romario: o rascunho "calculou aula dentro de um periodo
// indisponivel para o professor". Bloquear um horario na disponibilidade DO RASCUNHO, onde ja havia aula, nao avisava,
// a simulacao dizia "melhor" e o Promover gravava a aula em cima do bloqueio (so a tela Conflitos acusava, depois).
// Aqui fica a conferencia: aula com professor num horario que, com a disponibilidade do rascunho por cima da oficial,
// e bloqueio para o motor (bloqueio de verdade, HA fixa ou HA de probatorio). HA movel nao conta: o Promover a recalcula.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, disponibilidadeTable, disponibilidadeExperimentalTable, horariosExperimentaisTable, horariosTable, turmasTable, disciplinasTable, horarioSlotsTable } from "@workspace/db";
import { ehBloqueioParaMotor, ehBloqueioReal, ehHaFixa, ehHaProbatorio } from "./bloqueio-real";
import { ehHAManualDaTela } from "./ha-contraturno"; // [HA-SOBRE-AULA]
import { mapaIntegralDosSlots, posicaoReal } from "./turno-integral";

export type LinhaDispBloqueio = {
  professorId: number; diaSemana: number; horarioSlot: number; turno: string | null;
  disponivel: boolean | null; horaAtividadeObrigatoria: boolean | null; motivo?: string | null;
};
export type AulaBloqueio = { turmaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona?: boolean | null };
export type PosicaoReal = { turno: string; numeroAula: number };
export type AulaEmBloqueio<A extends AulaBloqueio> = { aula: A; linha: LinhaDispBloqueio; posicao: PosicaoReal };

const chave = (professorId: number, turno: string | null, dia: number, aula: number) => `${professorId}|${turno ?? ""}|${dia}|${aula}`;

/**
 * [HA-SOBRE-AULA] (12/11/2026) Retorno do diretor do Romario: "bloqueei para HA e ele manteve a aula". A HA comum
 * marcada na tela ("HA manual") e movel: fora do rascunho o recalculo a tira de cima da aula e a aula fica. Mas quem
 * marca HA NO RASCUNHO num horario com aula quer a aula fora dali; antes nada acusava e o Promover devolvia a HA para
 * outro horario. Agora essa HA (so a manual, so a que o rascunho mudou) prende o horario como bloqueio: a aula aparece
 * no quadro vermelho, o "Ver como resolver" sugere a troca e o Promover recusa ate a aula sair.
 */
export function ehHAManualDoRascunho(d: LinhaDispBloqueio, chavesDoRascunho?: Set<string>): boolean {
  return !!d.horaAtividadeObrigatoria && d.disponivel !== false && ehHAManualDaTela(d.motivo)
    && !!chavesDoRascunho?.has(chave(d.professorId, d.turno, d.diaSemana, d.horarioSlot));
}

/**
 * Aulas em horario bloqueado. `aulas` = as que serao conferidas contra qualquer bloqueio; `aulasSoMudancas` = as que
 * so contam se o bloqueio vier de uma mudanca do rascunho (`chavesDoRascunho`): a grade oficial de fora do rascunho nao
 * impede promover por um bloqueio antigo, mas impede se o rascunho bloquear em cima dela.
 * Aula assincrona nao tem horario presencial: nao entra.
 */
export function aulasEmBloqueio<A extends AulaBloqueio>(opts: {
  aulas: A[]; aulasSoMudancas?: A[]; disp: LinhaDispBloqueio[]; chavesDoRascunho?: Set<string>;
  posicao: (a: A) => PosicaoReal | null;
}): AulaEmBloqueio<A>[] {
  const bloqueios = new Map<string, LinhaDispBloqueio>();
  for (const d of opts.disp) if (ehBloqueioParaMotor(d) || ehHAManualDoRascunho(d, opts.chavesDoRascunho)) bloqueios.set(chave(d.professorId, d.turno, d.diaSemana, d.horarioSlot), d);
  const out: AulaEmBloqueio<A>[] = [];
  const vistos = new Set<string>();
  const conferir = (a: A, soMudancas: boolean) => {
    if (a.professorId == null || a.assincrona) return;
    const pos = opts.posicao(a);
    if (!pos) return;
    const k = chave(a.professorId, pos.turno, a.diaSemana, pos.numeroAula);
    const linha = bloqueios.get(k);
    if (!linha) return;
    if (soMudancas && !opts.chavesDoRascunho?.has(k)) return;
    const kAula = `${k}|${a.turmaId}`; // dupla docencia / linha repetida: uma vez so
    if (vistos.has(kAula)) return;
    vistos.add(kAula);
    out.push({ aula: a, linha, posicao: pos });
  };
  for (const a of opts.aulas) conferir(a, false);
  for (const a of opts.aulasSoMudancas ?? []) conferir(a, true);
  return out;
}

/** Chave da disponibilidade no mesmo formato da conferencia (para `chavesDoRascunho`). */
export const chaveBloqueio = (d: { professorId: number; turno: string | null; diaSemana: number; horarioSlot: number }) =>
  chave(d.professorId, d.turno, d.diaSemana, d.horarioSlot);

const DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const TURNO: Record<string, string> = { matutino: "manhã", vespertino: "tarde", noturno: "noite" };

export function tipoDoBloqueio(d: LinhaDispBloqueio): string {
  if (ehBloqueioReal(d)) return "bloqueio";
  if (ehHaFixa(d)) return "HA fixa";
  return ehHaProbatorio(d) ? "HA de probatório" : "HA marcada no rascunho"; // [HA-SOBRE-AULA]
}

/** Textos para a tela: "Maria Eloi tem bloqueio na quarta, 1ª aula (manhã), onde está a aula da 9ME." */
export function descreverAulasEmBloqueio<A extends AulaBloqueio>(
  lista: AulaEmBloqueio<A>[], nomeTurma: (id: number) => string, nomeProfessor: (id: number) => string,
): string[] {
  return lista.map(({ aula, linha, posicao }) =>
    `${nomeProfessor(aula.professorId!)} tem ${tipoDoBloqueio(linha)} na ${DIA[aula.diaSemana] ?? aula.diaSemana}, ${posicao.numeroAula}ª aula`
    + ` (${TURNO[posicao.turno] ?? posicao.turno}), onde está a aula da ${nomeTurma(aula.turmaId)}.`);
}

// ---------------------------------------------------------------------------------------------------------
// [AULA-EM-BLOQUEIO] Disponibilidade do rascunho: antes de gravar um bloqueio novo, as aulas que o rascunho ja tem
// do professor nesses horarios (a tela pede confirmacao mostrando a lista; a aula fica onde esta ate mudar de lugar).

export type ItemDispNovo = { diaSemana: number; horarioSlot: number; turno?: string | null; disponivel: boolean; horaAtividadeObrigatoria: boolean; motivo?: string };

export async function aulasDoRascunhoEmBloqueioNovo(escolaId: string, nome: string, professorId: number, itens: ItemDispNovo[]): Promise<string[]> {
  const [oficial, doExp] = await Promise.all([
    db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId)),
    db.select().from(disponibilidadeExperimentalTable).where(and(eq(disponibilidadeExperimentalTable.escolaId, escolaId),
      eq(disponibilidadeExperimentalTable.nome, nome), eq(disponibilidadeExperimentalTable.professorId, professorId))).catch(() => []),
  ]);
  const atual = new Map<string, LinhaDispBloqueio>();
  for (const d of oficial) atual.set(chaveBloqueio(d), d);
  for (const d of doExp) atual.set(chaveBloqueio(d), d);
  const novos = new Set<string>();
  for (const it of itens) {
    if (!it.turno) continue;
    const k = chaveBloqueio({ professorId, turno: it.turno, diaSemana: it.diaSemana, horarioSlot: it.horarioSlot });
    const antes = atual.get(k);
    // motivo omitido = mantem o da linha (a tela faz isso quando continua bloqueio)
    const depois = { disponivel: it.disponivel, horaAtividadeObrigatoria: it.horaAtividadeObrigatoria, motivo: it.motivo ?? antes?.motivo ?? null };
    // [HA-SOBRE-AULA] HA manual gravada no rascunho tambem prende o horario (ver ehHAManualDoRascunho)
    const prende = (d: { disponivel: boolean | null; horaAtividadeObrigatoria: boolean | null; motivo?: string | null }) =>
      ehBloqueioParaMotor(d) || (!!d.horaAtividadeObrigatoria && d.disponivel !== false && ehHAManualDaTela(d.motivo));
    if (prende(depois) && !(antes && prende(antes))) novos.add(k);
  }
  if (!novos.size) return [];
  type AulaPos = { turmaId: number; disciplinaId: number; diaSemana: number; numeroAula: number; assincrona: boolean | null };
  const doRasc = and(eq(horariosExperimentaisTable.escolaId, escolaId), eq(horariosExperimentaisTable.nome, nome));
  const [noRascunho, turmasDoRascunho, oficialDoProf] = await Promise.all([
    db.select().from(horariosExperimentaisTable).where(and(doRasc, eq(horariosExperimentaisTable.professorId, professorId))),
    db.selectDistinct({ turmaId: horariosExperimentaisTable.turmaId }).from(horariosExperimentaisTable).where(doRasc),
    db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.professorId, professorId),
      sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
  ]);
  // turma fora do rascunho (rascunho de um turno ou de turmas escolhidas): a aula oficial dela continua depois de promover
  const dentro = new Set(turmasDoRascunho.map((t) => t.turmaId));
  const aulas: AulaPos[] = [...noRascunho, ...oficialDoProf.filter((h) => !dentro.has(h.turmaId))];
  if (!aulas.length) return [];
  const [turmas, slots] = await Promise.all([
    db.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);
  const turnoDaTurma = new Map(turmas.map((t) => [t.id, t.turno]));
  const nomeTurma = new Map(turmas.map((t) => [t.id, t.nome]));
  const mapa = mapaIntegralDosSlots(slots);
  const achadas: Array<{ a: typeof aulas[number]; pos: PosicaoReal }> = [];
  const vistos = new Set<string>();
  for (const a of aulas) {
    if (a.assincrona) continue;
    const pos = posicaoReal(a.turmaId, a.numeroAula, turnoDaTurma, mapa);
    if (!pos) continue;
    const k = chaveBloqueio({ professorId, turno: pos.turno, diaSemana: a.diaSemana, horarioSlot: pos.numeroAula });
    if (!novos.has(k) || vistos.has(`${k}|${a.turmaId}`)) continue;
    vistos.add(`${k}|${a.turmaId}`);
    achadas.push({ a, pos });
  }
  if (!achadas.length) return [];
  const discs = new Map((await db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome }).from(disciplinasTable)
    .where(inArray(disciplinasTable.id, [...new Set(achadas.map((x) => x.a.disciplinaId))]))).map((d) => [d.id, d.nome]));
  return achadas
    .sort((x, y) => x.a.diaSemana - y.a.diaSemana || x.pos.numeroAula - y.pos.numeroAula)
    .map(({ a, pos }) => `${nomeTurma.get(a.turmaId) ?? `Turma #${a.turmaId}`} (${discs.get(a.disciplinaId) ?? "aula"}) na ${DIA[a.diaSemana] ?? a.diaSemana}, ${pos.numeroAula}ª aula (${TURNO[pos.turno] ?? pos.turno})`);
}
