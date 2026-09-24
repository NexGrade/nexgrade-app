/**
 * [CAPACIDADE-PROFESSOR] Pre-validacao ANTES de gerar grade.
 * Para cada professor: aulas (mesma carga que o payload do CP-SAT recebe) +
 * HA exigida (mesma formula do recalcular-ha) contra horarios livres
 * (mesma regra de bloqueio, ehBloqueioReal). Nao grava nada.
 * Limite: nao enxerga o limite de HA por dia (so aparece depois de gerar).
 */
import { db, turmasTable, turmaDisciplinasTable, disciplinasTable, professoresTable, disponibilidadeTable, horarioSlotsTable, professorDisciplinasTable, itensMatrizTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { ehBloqueioReal } from "./bloqueio-real";
import { calcularHoraAtividadeInstitucional } from "./recalcular-ha";

export interface ProblemaCapacidade {
  professorId: number;
  professor: string;
  nivel: "erro" | "aviso";
  mensagem: string;
  aulasPorTurno: Record<string, number>;
  aulasTotal: number;
  haExigida: number;
  livresPorTurno: Record<string, number>;
}

export async function validarCapacidadeProfessores(escolaId: string): Promise<ProblemaCapacidade[]> {
  const turmas = await db.select().from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.fantasma, false)));
  if (turmas.length === 0) return [];
  const turmaIds = turmas.map((t) => t.id);
  const matrizIds = [...new Set(turmas.map((t) => t.matrizCurricularId).filter((id): id is number => id != null))];
  const [tds, disciplinas, professores, profDiscs, itensMatriz, slots] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(professorDisciplinasTable),
    matrizIds.length > 0 ? db.select().from(itensMatrizTable).where(inArray(itensMatrizTable.matrizCurricularId, matrizIds)) : Promise.resolve([]),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);
  const profIds = professores.map((p) => p.id);
  const disp = profIds.length > 0 ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds)) : [];

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((d) => [d.id, d]));
  const profMap = new Map(professores.map((p) => [p.id, p]));
  const itemMap = new Map(itensMatriz.map((im) => [`${im.matrizCurricularId}-${im.disciplinaId}`, im]));

  // mesma regra do resolverProfessor do payload do CP-SAT (horarios.ts)
  const resolverProfessor = (td: (typeof tds)[number], turma: (typeof turmas)[number]) => {
    if (td.professorId != null) return profMap.get(td.professorId) ?? null;
    const candidatos = profDiscs
      .filter((pd) => pd.disciplinaId === td.disciplinaId)
      .map((pd) => profMap.get(pd.professorId))
      .filter((p): p is NonNullable<typeof p> => p != null);
    return candidatos.find((p) => p.nome.includes(`(${turma.nome})`)) ?? null;
  };

  const aulas = new Map<number, Record<string, number>>();
  for (const td of tds) {
    const turma = turmaMap.get(td.turmaId);
    if (!turma) continue;
    const prof = resolverProfessor(td, turma);
    if (!prof) continue;
    const disc = discMap.get(td.disciplinaId);
    const n = td.cargaHorariaSemanalOverride ?? itemMap.get(`${turma.matrizCurricularId}-${td.disciplinaId}`)?.cargaHorariaSemanal ?? disc?.cargaSemanal ?? 0;
    if (!n || n <= 0) continue;
    const r = aulas.get(prof.id) ?? {};
    r[turma.turno] = (r[turma.turno] ?? 0) + n;
    aulas.set(prof.id, r);
  }

  const maxAulaTurno = new Map<string, number>();
  for (const s of slots) {
    if (!s.letivo) continue;
    if (s.numeroAula > (maxAulaTurno.get(s.turno) ?? 0)) maxAulaTurno.set(s.turno, s.numeroAula);
  }
  const turnos = [...maxAulaTurno.keys()];

  const problemas: ProblemaCapacidade[] = [];
  for (const [pid, porTurno] of aulas) {
    const p = profMap.get(pid);
    if (!p) continue;
    const bloqueados = new Map<string, Set<string>>();
    for (const d of disp) {
      if (d.professorId !== pid || !ehBloqueioReal(d)) continue;
      const alvos = d.turno == null ? turnos : [d.turno];
      for (const t of alvos) {
        if (!bloqueados.has(t)) bloqueados.set(t, new Set());
        bloqueados.get(t)!.add(`${d.diaSemana}-${d.horarioSlot}`);
      }
    }
    const livres: Record<string, number> = {};
    for (const t of turnos) {
      const mx = maxAulaTurno.get(t) ?? 0;
      let n = 0;
      for (let dia = 0; dia < 5; dia++) for (let a = 1; a <= mx; a++) if (!bloqueados.get(t)?.has(`${dia}-${a}`)) n++;
      livres[t] = n;
    }
    const aulasTotal = Object.values(porTurno).reduce((s, n) => s + n, 0);
    const ha = calcularHoraAtividadeInstitucional(aulasTotal);
    const turnosEnsino = Object.keys(porTurno);
    const livresEnsino = turnosEnsino.reduce((s, t) => s + (livres[t] ?? 0), 0);
    const livresTotal = turnos.reduce((s, t) => s + (livres[t] ?? 0), 0);
    const base = { professorId: pid, professor: p.nome, aulasPorTurno: porTurno, aulasTotal, haExigida: ha, livresPorTurno: livres };
    for (const t of turnosEnsino) {
      const l = livres[t] ?? 0;
      if (porTurno[t]! > l) problemas.push({ ...base, nivel: "erro", mensagem: `${porTurno[t]} aula(s) no ${t}, mas so ${l} horario(s) livre(s) nesse turno: a grade nao fecha. Libere ${porTurno[t]! - l} horario(s) ou reduza a carga.` });
    }
    const precisa = aulasTotal + ha;
    if (precisa > livresTotal) {
      problemas.push({ ...base, nivel: "erro", mensagem: `Precisa de ${precisa} horarios (${aulasTotal} aulas + ${ha} HA), mas so tem ${livresTotal} livres em todos os turnos: faltam ${precisa - livresTotal}. A HA vai ficar incompleta.` });
    } else if (precisa > livresEnsino) {
      problemas.push({ ...base, nivel: "aviso", mensagem: `Cabe, mas so usando contraturno: cerca de ${precisa - livresEnsino} HA fora dos turnos de ensino.` });
    }
  }
  return problemas.sort((a, b) => (a.nivel === b.nivel ? a.professor.localeCompare(b.professor) : a.nivel === "erro" ? -1 : 1));
}
