// [AGENDA-ASSINCRONAS] (06/11/2026) Dados da agenda das assincronas (grade oficial, trio com revezamento, calendario),
// usados pelo relatorio por periodo da presenca (routes/pedagogia.ts) e pelo calendario trimestral (routes/export.ts).
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  db, turmasTable, disciplinasTable, horariosTable, horarioSlotsTable, calendarioEscolarTable, turmaDisciplinasTable, professoresTable,
} from "@workspace/db";
import { projetarIntegral, mapaIntegralDosSlots } from "./turno-integral";
import { carregarAssSoTurma } from "./assincrona-so-turma";
import { ordemPresencial } from "./revezamento-trio";
import { montarAgendaAssincronas, type AulaAssincrona, type DiaDaAgenda, type LinhaAgenda, type TrioDaAula } from "./agenda-assincronas";
import type { SlotEsquema } from "./presenca";

const TIPOS_SEM_AULA = ["feriado", "recesso", "ponto_facultativo", "estudo_planejamento"];

export type DadosAgenda = {
  dias: DiaDaAgenda[]; aulas: AulaAssincrona[]; trio: Map<string, TrioDaAula>; slots: SlotEsquema[];
  nomes: Map<number, string>; turmas: Array<{ id: number; nome: string; turno: string }>;
  disciplinas: Map<number, string>;
};

export async function carregarDadosAgenda(escolaId: string, de: string, ate: string): Promise<DadosAgenda> {
  const [turmasDoBanco, disciplinas, horariosDoBanco, slotsBanco, eventos, professores] = await Promise.all([
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome, sigla: disciplinasTable.sigla }).from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.assincrona, true), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    db.select().from(calendarioEscolarTable).where(and(eq(calendarioEscolarTable.escolaId, escolaId), gte(calendarioEscolarTable.data, de), lte(calendarioEscolarTable.data, ate))),
    db.select({ id: professoresTable.id, nome: professoresTable.nome }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
  ]);
  const turmaIds = turmasDoBanco.map((t) => t.id);
  const trioLinhas = turmaIds.length ? await db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)) : [];
  // todos os membros do trio (tambem quem nao tem assincrona: pode ser o presencial da semana)
  const trio = new Map<string, TrioDaAula>();
  for (const l of trioLinhas) {
    if (!l.professorId || !l.trioOrdem || !l.trioInicio || !(l.grupoTrio ?? "").trim()) continue;
    trio.set(`${l.turmaId}|${l.disciplinaId}|${l.professorId}`, { grupo: `${l.turmaId}:${(l.grupoTrio ?? "").trim()}`, ordem: l.trioOrdem, inicio: l.trioInicio });
  }
  const { turmas, aulas } = projetarIntegral(turmasDoBanco, horariosDoBanco, mapaIntegralDosSlots(slotsBanco));
  const ehAssSoTurma = await carregarAssSoTurma(escolaId);
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((d) => [d.id, d]));
  const origPorId = new Map(horariosDoBanco.map((h) => [h.id, h]));
  const lista: AulaAssincrona[] = [];
  for (const h of aulas) {
    const t = turmaMap.get(h.turmaId);
    if (!t || ehAssSoTurma(h, t) || h.professorId == null) continue; // a da 7a aula nao letiva e so da turma
    const orig = origPorId.get(h.id);
    const tr = orig ? trio.get(`${orig.turmaId}|${orig.disciplinaId}|${orig.professorId}`) : undefined;
    if (tr) trio.set(`${h.turmaId}|${h.disciplinaId}|${h.professorId}`, tr); // turma integral projetada
    const d = discMap.get(h.disciplinaId);
    lista.push({ turmaId: h.turmaId, turma: t.nome, turno: t.turno, nivelEnsino: t.nivelEnsino ?? null, diaSemana: h.diaSemana, numeroAula: h.numeroAula, disciplinaId: h.disciplinaId, disciplina: d?.nome || d?.sigla || "", professorId: h.professorId });
  }
  const dias: DiaDaAgenda[] = [];
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) {
    const data = new Date(t).toISOString().slice(0, 10);
    const ev = eventos.find((e) => e.data === data && !e.diaLetivo && TIPOS_SEM_AULA.includes(e.tipo));
    dias.push({ data, semAula: ev ? ev.descricao : null });
  }
  const slots = slotsBanco.map((s) => ({ turno: s.turno, nivelEnsino: s.nivelEnsino ?? null, numeroAula: s.numeroAula, horaInicio: String(s.horaInicio), duracaoMinutos: s.duracaoMinutos ?? 50, letivo: s.letivo }));
  return {
    dias, aulas: lista, trio, slots, nomes: new Map(professores.map((p) => [p.id, p.nome])),
    turmas: turmasDoBanco.map((t) => ({ id: t.id, nome: t.nome, turno: t.turno })),
    disciplinas: new Map(disciplinas.map((d) => [d.id, d.nome || d.sigla || ""])),
  };
}

export const ordemDaSemana = (inicio: string, dataISO: string) => ordemPresencial(inicio, new Date(`${dataISO}T12:00:00Z`));

export function agendaDoPeriodo(d: DadosAgenda, professorId: number | null = null): LinhaAgenda[] {
  return montarAgendaAssincronas({ dias: d.dias, aulas: d.aulas, trio: d.trio, slots: d.slots, nomes: d.nomes, ordemDaSemana, professorId });
}

/** [CALENDARIO-ASSINCRONAS] quem esta presencial na Hibrida da turma na semana (pelo revezamento do trio). */
export function presenciaisDoTrio(d: DadosAgenda) {
  const idsPorNome = new Map<string, number[]>();
  for (const t of d.turmas) idsPorNome.set(t.nome, [...(idsPorNome.get(t.nome) ?? []), t.id]);
  return (turma: string, segunda: string): string[] => {
    const ids = new Set(idsPorNome.get(turma) ?? []);
    const saida = new Set<string>();
    for (const [chave, t] of d.trio) {
      const [turmaId, disciplinaId, professorId] = chave.split("|").map(Number) as [number, number, number];
      if (!ids.has(turmaId) || t.ordem !== ordemDaSemana(t.inicio, segunda)) continue;
      saida.add(`${d.nomes.get(professorId) ?? `#${professorId}`} (${d.disciplinas.get(disciplinaId) ?? ""})`);
    }
    return [...saida];
  };
}
