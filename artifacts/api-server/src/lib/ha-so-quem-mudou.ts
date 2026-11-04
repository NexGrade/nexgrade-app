// [HA-SO-QUEM-MUDOU-GERAL] (04/11/2026) A promocao refaz a HA so de quem teve aula mexida (ou esta com a quantidade
// diferente da regra, [HA-INCOMPLETA-REFAZ]); os demais ficam com a HA de hoje, inclusive a importada e a que o
// "HA no buraco" encaixou. Gerar direto (gerador simples) e "Corrigir professor" chamavam o recalculo da escola
// inteira: corrigir as aulas de UM professor refazia a HA de todos (a importada virava automatica e as HA encaixadas
// voltavam para o lugar do calculo guloso, abrindo janelas em quem nem foi tocado). Aqui a mesma regra da promocao,
// para esses dois caminhos: fotografar antes, recalcular, devolver a HA de quem nao mudou e levar a HA de quem mudou
// para os buracos.
import { db, horariosTable, disponibilidadeTable, professoresTable, turmasTable, horarioSlotsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { recalcularHoraAtividade } from "./recalcular-ha";
import { professoresComHAIncompleta } from "./ha-incompleta";
import { reposicionarHAMovel, slotsLetivosPorTurno, type AulaPos } from "./reposicionar-ha";
import { montarMapaPrincipal } from "./professor-principal";
import { mapaIntegralDosSlots, posicaoReal, TURNO_INTEGRAL } from "./turno-integral";

type LinhaHorario = typeof horariosTable.$inferSelect;
type LinhaDisp = typeof disponibilidadeTable.$inferSelect;
export interface FotoAntes { oficial: LinhaHorario[]; ha: LinhaDisp[] }

const TURNOS = ["matutino", "vespertino", "noturno"];

async function oficialDaEscola(escolaId: string): Promise<LinhaHorario[]> {
  return db.select().from(horariosTable)
    .where(and(eq(horariosTable.escolaId, escolaId), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`));
}

async function haDaEscola(escolaId: string, profIds: number[]): Promise<LinhaDisp[]> {
  if (!profIds.length) return [];
  return db.select().from(disponibilidadeTable)
    .where(and(inArray(disponibilidadeTable.professorId, profIds), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)));
}

async function idsProfessores(escolaId: string): Promise<number[]> {
  return (await db.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))).map((p) => p.id);
}

/** Chamar ANTES de mexer na grade oficial. */
export async function fotografarGradeEHA(escolaId: string): Promise<FotoAntes> {
  const [oficial, ids] = await Promise.all([oficialDaEscola(escolaId), idsProfessores(escolaId)]);
  return { oficial, ha: await haDaEscola(escolaId, ids) };
}

/** Professores com alguma aula diferente entre as duas grades (mesma chave da promocao). */
export function professoresQueMudaram(antes: LinhaHorario[], depois: LinhaHorario[]): Set<number> {
  const chave = (h: LinhaHorario) => `${h.turmaId}|${h.disciplinaId}|${h.diaSemana}|${h.numeroAula}`;
  const porProf = (rows: LinhaHorario[]) => {
    const m = new Map<number, Set<string>>();
    for (const r of rows) {
      if (r.professorId == null) continue;
      if (!m.has(r.professorId)) m.set(r.professorId, new Set());
      m.get(r.professorId)!.add(chave(r));
    }
    return m;
  };
  const a = porProf(antes), d = porProf(depois);
  const r = new Set<number>();
  for (const p of new Set([...a.keys(), ...d.keys()])) {
    const x = a.get(p) ?? new Set<string>(), y = d.get(p) ?? new Set<string>();
    if (x.size !== y.size || [...x].some((k) => !y.has(k))) r.add(p);
  }
  return r;
}

/**
 * Recalcula a HA e devolve a de hoje a quem nao teve aula mexida e esta com a quantidade da regra.
 * Lanca erro se o recalculo falhar (o chamador decide como avisar).
 */
export async function recalcularHASoDeQuemMudou(escolaId: string, antes: FotoAntes): Promise<{ refeitos: number; mantidos: number; reposicionadas: number }> {
  await recalcularHoraAtividade(escolaId);
  const [depois, ids] = await Promise.all([oficialDaEscola(escolaId), idsProfessores(escolaId)]);
  const haRecalc = await haDaEscola(escolaId, ids);

  const refazer = professoresQueMudaram(antes.oficial, depois);
  for (const p of professoresComHAIncompleta(haRecalc, antes.ha, TURNOS)) refazer.add(p);
  const mantem = ids.filter((p) => !refazer.has(p));
  const haMantida = antes.ha.filter((d) => mantem.includes(d.professorId));

  if (mantem.length) {
    await db.transaction(async (tx) => {
      await tx.delete(disponibilidadeTable)
        .where(and(inArray(disponibilidadeTable.professorId, mantem), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)));
      for (let i = 0; i < haMantida.length; i += 500) {
        const lote = haMantida.slice(i, i + 500);
        await tx.delete(disponibilidadeTable).where(sql`(${disponibilidadeTable.professorId}, ${disponibilidadeTable.diaSemana}, ${disponibilidadeTable.horarioSlot}, COALESCE(${disponibilidadeTable.turno}, '')) IN (${sql.join(
          lote.map((x) => sql`(${x.professorId}, ${x.diaSemana}, ${x.horarioSlot}, ${x.turno ?? ""})`), sql`, `)})`);
        await tx.insert(disponibilidadeTable).values(lote.map(({ id: _id, createdAt: _c, ...resto }) => resto));
      }
    });
  }

  // HA no buraco para quem teve a HA refeita (como na promocao)
  let reposicionadas = 0;
  const refeitos = [...refazer].filter((p) => ids.includes(p));
  if (refeitos.length) {
    const [turmas, slots, profs] = await Promise.all([
      db.select({ id: turmasTable.id, turno: turmasTable.turno }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
      db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
      db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    ]);
    const turnoDaTurma = new Map(turmas.map((t) => [t.id, t.turno]));
    const mapa = mapaIntegralDosSlots(slots);
    const aulas: AulaPos[] = depois.flatMap((h) => {
      const r = posicaoReal(h.turmaId, h.numeroAula, turnoDaTurma, mapa);
      return r && h.professorId != null && r.turno !== TURNO_INTEGRAL ? [{ professorId: h.professorId, turno: r.turno, diaSemana: h.diaSemana, numeroAula: r.numeroAula }] : [];
    });
    const disp = await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, refeitos));
    const movs = reposicionarHAMovel({ aulas, disp, slotsLetivos: slotsLetivosPorTurno(slots), turnos: TURNOS, professores: refeitos, principal: montarMapaPrincipal(profs) });
    if (movs.length) {
      await db.transaction(async (tx) => {
        for (const m of movs) await tx.update(disponibilidadeTable).set({ horarioSlot: -m.linha.id }).where(eq(disponibilidadeTable.id, m.linha.id));
        for (const m of movs) {
          await tx.delete(disponibilidadeTable).where(and(
            eq(disponibilidadeTable.professorId, m.linha.professorId), eq(disponibilidadeTable.diaSemana, m.diaSemana),
            eq(disponibilidadeTable.horarioSlot, m.horarioSlot), sql`COALESCE(${disponibilidadeTable.turno}, '') = ${m.linha.turno ?? ""}`,
            eq(disponibilidadeTable.horaAtividadeObrigatoria, false), eq(disponibilidadeTable.disponivel, true),
          ));
          await tx.update(disponibilidadeTable).set({ diaSemana: m.diaSemana, horarioSlot: m.horarioSlot }).where(eq(disponibilidadeTable.id, m.linha.id));
        }
      });
      reposicionadas = movs.length;
    }
  }
  console.log(`[HA-SO-QUEM-MUDOU-GERAL] HA refeita para ${refeitos.length} professor(es); ${mantem.length} ficaram com a de hoje; ${reposicionadas} HA no buraco`);
  return { refeitos: refeitos.length, mantidos: mantem.length, reposicionadas };
}
