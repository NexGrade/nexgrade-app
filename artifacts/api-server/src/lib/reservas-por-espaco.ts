// [RESERVAS-POR-ESPACO] (28/10/2026) PDF "grade de utilizacao" da semana: um quadro por espaco
// (laboratorio, sala, quadra...) e por equipamento (chromebooks, tablets...), no periodo escolhido,
// com os dias nas colunas e as aulas nas linhas. Em cada aula: turma, disciplina e professor
// (da aula do professor naquele horario) -- como os quadros que as escolas afixavam na porta do
// laboratorio. Usa o mesmo desenho em paisagem dos PDFs da grade (2 quadros por linha).
// So entram espacos/equipamentos com pelo menos uma reserva (pendente ou confirmada) na semana.
import { db, disciplinasTable, horarioSlotsTable, horariosTable, professoresTable, recursosTable, reservasRecursosTable, reservasTable, salasTable, turmasTable } from "@workspace/db";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { abreviarEspaco, abreviarProfessor, segundaDaSemana } from "./espacos-livres";
import type { BlocoGrade } from "./pdf-grade";

export type ReservaCelula = { local: string; equipamento: boolean; dia: number; numeroAula: number; professor: string; turma: string | null; disciplina: string | null; quantidade: number | null; pendente: boolean };

/** Texto da celula: "8ºA · MAT" na 1a linha, professor (e quantidade) na 2a; varias reservas juntas. */
export function montarBlocosReservas(reservas: ReservaCelula[], horariosPorAula: Record<number, string>): BlocoGrade[] {
  const locais = [...new Set(reservas.map((r) => `${r.equipamento ? "1" : "0"}|${r.local}`))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return locais.map((chave) => {
    const [eq, local] = [chave.startsWith("1"), chave.slice(2)];
    const doLocal = reservas.filter((r) => r.local === local && r.equipamento === eq);
    const porCelula = new Map<string, ReservaCelula[]>();
    for (const r of doLocal) {
      const k = `${r.dia}-${r.numeroAula}`;
      porCelula.set(k, [...(porCelula.get(k) ?? []), r]);
    }
    return {
      rotulo: `${eq ? "Equipamento" : "Espaço"}: ${local}`,
      horariosPorAula,
      slots: [...porCelula.values()].map((g) => ({
        diaSemana: g[0]!.dia,
        numeroAula: g[0]!.numeroAula,
        linha1: g.map((r) => [r.turma, r.disciplina].filter(Boolean).join(" · ") || "Reserva").join(" / "),
        linha2: g.map((r) => `${r.professor}${r.quantidade ? ` (${r.quantidade})` : ""}${r.pendente ? " (aguard.)" : ""}`).join(" / "),
        destacado: g.some((r) => r.pendente),
      })),
    };
  });
}

export async function dadosReservasPorEspaco(escolaId: string, dataQualquer: string, turno: string) {
  const inicio = segundaDaSemana(dataQualquer);
  const fimD = new Date(`${inicio}T12:00:00Z`); fimD.setUTCDate(fimD.getUTCDate() + 4);
  const fim = fimD.toISOString().slice(0, 10);
  const [espacos, equip, aulas, slots] = await Promise.all([
    db.select({ local: salasTable.nome, data: reservasTable.data, numeroAula: reservasTable.numeroAula, turnoRes: reservasTable.turno, status: reservasTable.status,
      professorId: reservasTable.professorId, professor: professoresTable.nome, horarioId: reservasTable.horarioId })
      .from(reservasTable)
      .innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
      .innerJoin(professoresTable, eq(professoresTable.id, reservasTable.professorId))
      .where(and(eq(reservasTable.escolaId, escolaId), gte(reservasTable.data, inicio), lte(reservasTable.data, fim), ne(reservasTable.status, "cancelada"))),
    db.select({ local: recursosTable.nome, data: reservasRecursosTable.data, numeroAula: reservasRecursosTable.numeroAula, turnoRes: reservasRecursosTable.turno, status: reservasRecursosTable.status,
      professorId: reservasRecursosTable.professorId, professor: professoresTable.nome, quantidade: reservasRecursosTable.quantidade })
      .from(reservasRecursosTable)
      .innerJoin(recursosTable, eq(recursosTable.id, reservasRecursosTable.recursoId))
      .innerJoin(professoresTable, eq(professoresTable.id, reservasRecursosTable.professorId))
      .where(and(eq(reservasRecursosTable.escolaId, escolaId), gte(reservasRecursosTable.data, inicio), lte(reservasRecursosTable.data, fim), ne(reservasRecursosTable.status, "cancelada"))),
    // aulas da grade oficial do periodo: de onde vem a turma e a disciplina de cada reserva
    db.select({ id: horariosTable.id, professorId: horariosTable.professorId, dia: horariosTable.diaSemana, numeroAula: horariosTable.numeroAula, turma: turmasTable.nome, turno: turmasTable.turno,
      disciplina: disciplinasTable.nome, sigla: disciplinasTable.sigla })
      .from(horariosTable)
      .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
      .where(and(eq(horariosTable.escolaId, escolaId), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
    db.select({ turno: horarioSlotsTable.turno, numeroAula: horarioSlotsTable.numeroAula, horaInicio: horarioSlotsTable.horaInicio, letivo: horarioSlotsTable.letivo })
      .from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),
  ]);
  const diaDe = (d: string) => Math.round((Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000);
  const discCurta = (a: { disciplina: string; sigla: string | null }) => a.sigla?.toUpperCase() ?? a.disciplina;
  const aulaDe = (horarioId: number | null | undefined, professorId: number, dia: number, numeroAula: number) =>
    (horarioId ? aulas.find((a) => a.id === horarioId) : undefined)
    ?? aulas.find((a) => a.professorId === professorId && a.dia === dia && a.numeroAula === numeroAula && a.turno === turno);
  const reservas: ReservaCelula[] = [];
  for (const r of espacos) {
    if (r.turnoRes !== null && r.turnoRes !== turno) continue;
    const dia = diaDe(String(r.data));
    if (dia < 0 || dia > 4) continue;
    const a = aulaDe(r.horarioId, r.professorId, dia, r.numeroAula);
    reservas.push({ local: abreviarEspaco(r.local), equipamento: false, dia, numeroAula: r.numeroAula, professor: abreviarProfessor(r.professor), turma: a?.turma ?? null, disciplina: a ? discCurta(a) : null, quantidade: null, pendente: r.status === "pendente" });
  }
  for (const r of equip) {
    if (r.turnoRes !== turno) continue;
    const dia = diaDe(String(r.data));
    if (dia < 0 || dia > 4) continue;
    const a = aulaDe(null, r.professorId, dia, r.numeroAula);
    reservas.push({ local: abreviarEspaco(r.local), equipamento: true, dia, numeroAula: r.numeroAula, professor: abreviarProfessor(r.professor), turma: a?.turma ?? null, disciplina: a ? discCurta(a) : null, quantidade: r.quantidade, pendente: r.status === "pendente" });
  }
  // linhas = aulas letivas do periodo (o mesmo numero em niveis diferentes: a hora mais cedo)
  const horariosPorAula: Record<number, string> = {};
  for (const s of slots) {
    if (s.letivo === false) continue;
    const h = String(s.horaInicio ?? "").slice(0, 5);
    if (!horariosPorAula[s.numeroAula] || h < horariosPorAula[s.numeroAula]!) horariosPorAula[s.numeroAula] = h;
  }
  return { inicio, fim, blocos: montarBlocosReservas(reservas, horariosPorAula) };
}
