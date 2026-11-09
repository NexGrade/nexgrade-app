// [TROCA-LEVA-AULAS] (09/11/2026) Pedido da dona (Romario Martins, 06/11): trocar o professor de uma disciplina em
// Turmas so mudava o vinculo; a grade continuava com o professor anterior ate gerar de novo (e quem tentava lancar a
// aula a mao batia na trava de choque). Agora as aulas dessa disciplina nessa turma passam para o professor novo,
// como ja acontece no rascunho. Antes, confere os choques com a mesma regra da trava do banco:
//  - choque com aula de outra turma: as aulas NAO mudam (o banco recusaria); a troca so do vinculo precisa ser
//    confirmada, com o aviso de que a grade continua com o anterior;
//  - bloqueio ou hora-atividade do professor novo nesses horarios: avisa e troca se confirmar.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, horariosTable, turmasTable, horarioSlotsTable, professoresTable, disponibilidadeTable } from "@workspace/db";
import { choquesDeProfessor, descreverChoques, type TurmaHora } from "./choques-professor";

const DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

export type PlanoTroca = {
  /** ids das aulas da grade oficial (turma + disciplina + professor anterior) que passariam para o novo */
  aulaIds: number[];
  /** choques com aula de outra turma: com eles as aulas nao podem mudar */
  choques: string[];
  /** bloqueio ou HA do professor novo nesses horarios: so aviso */
  avisos: string[];
};

export async function planejarTrocaNaGrade(
  escolaId: string, turmaId: number, disciplinaId: number, professorAntes: number, professorNovo: number,
): Promise<PlanoTroca> {
  const daDisciplina = await db.select().from(horariosTable).where(and(
    eq(horariosTable.escolaId, escolaId), eq(horariosTable.turmaId, turmaId), eq(horariosTable.disciplinaId, disciplinaId),
    eq(horariosTable.professorId, professorAntes), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`));
  if (!daDisciplina.length) return { aulaIds: [], choques: [], avisos: [] };

  const [turmas, slots, doNovo, prof, disp] = await Promise.all([
    db.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno, nivelEnsino: turmasTable.nivelEnsino }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(and(
      eq(horariosTable.escolaId, escolaId), eq(horariosTable.professorId, professorNovo), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
    db.select({ nome: professoresTable.nome }).from(professoresTable).where(eq(professoresTable.id, professorNovo)).then((r) => r[0]),
    db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorNovo)),
  ]);
  const tm = new Map<number, TurmaHora>(turmas.map((t) => [t.id, { ...t, nivelEnsino: t.nivelEnsino ?? null }]));
  const nome = prof?.nome ?? "O professor novo";

  const movidas = daDisciplina.map((h) => ({ ...h, professorId: professorNovo }));
  const ids = new Set(movidas.map((h) => h.id));
  const choques = choquesDeProfessor([...movidas, ...doNovo.filter((h) => !ids.has(h.id))], tm, slots.map((s) => ({ ...s, nivelEnsino: s.nivelEnsino ?? null })), (a) => ids.has(a.id));

  const turma = tm.get(turmaId);
  const avisos: string[] = [];
  for (const h of daDisciplina) {
    // turma integral: a disponibilidade e a do horario real (manha/tarde); aqui so os turnos comuns
    const d = turma && turma.turno !== "integral"
      ? disp.find((x) => x.turno === turma.turno && x.diaSemana === h.diaSemana && x.horarioSlot === h.numeroAula && (!x.disponivel || x.horaAtividadeObrigatoria))
      : undefined;
    if (d) avisos.push(`${nome} tem ${d.horaAtividadeObrigatoria ? "hora-atividade" : "bloqueio"} na ${DIA[h.diaSemana] ?? h.diaSemana}, ${h.numeroAula}ª aula.`);
  }
  return { aulaIds: [...ids], choques: descreverChoques(choques, tm, () => nome), avisos: [...new Set(avisos)] };
}

/** Passa as aulas para o professor novo (numa transacao; a trava do banco continua valendo). */
export async function passarAulasParaProfessor(escolaId: string, aulaIds: number[], professorNovo: number): Promise<number> {
  if (!aulaIds.length) return 0;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"grade-oficial:" + escolaId}))`); // mesma trava do promover
    const r = await tx.update(horariosTable).set({ professorId: professorNovo })
      .where(and(eq(horariosTable.escolaId, escolaId), inArray(horariosTable.id, aulaIds))).returning({ id: horariosTable.id });
    return r.length;
  });
}
