import {
  db,
  disciplinasTable,
  disponibilidadeTable,
  horarioSlotsTable,
  horariosTable,
  turmasTable,
} from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { carregarAssSoTurma } from "./assincrona-so-turma"; // [ASS-SO-TURMA]
import { ehHAOutroTurno } from "./ha-contraturno"; // [HA-OUTRO-TURNO]
import { mapaRevezamento, hojeBrasil } from "./revezamento-trio"; // [REVEZAMENTO-TRIO]

// [PDF-AGENDA] dados da agenda (aulas oficiais, HA e horarios) usados pela tela e pelo PDF
export async function dadosAgenda(professor: { id: number }, escolaId: string) {
  const linhasTodas = await db
    .select({
      diaSemana: horariosTable.diaSemana,
      numeroAula: horariosTable.numeroAula,
      sala: horariosTable.sala,
      disciplinaNome: disciplinasTable.nome,
      disciplinaSigla: disciplinasTable.sigla,
      assincrona: horariosTable.assincrona, // [ASSINCRONA-EXIBICAO]
      turmaId: horariosTable.turmaId, // [REVEZAMENTO-TRIO]
      disciplinaId: horariosTable.disciplinaId,
      disciplinaCor: disciplinasTable.cor,
      turmaNome: turmasTable.nome,
      turno: turmasTable.turno, // [AGENDA-TURNOS]
      nivelEnsino: turmasTable.nivelEnsino, // [ASS-SO-TURMA]
    })
    .from(horariosTable)
    .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(
      and(
        eq(horariosTable.professorId, professor.id),
        eq(horariosTable.escolaId, escolaId),
        or(eq(horariosTable.versaoGrade, "oficial"), isNull(horariosTable.versaoGrade)),
      ),
    )
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);
  // [ASS-SO-TURMA] a assincrona da 7a aula (nao letiva) e so da turma: fora da agenda do professor
  const ehAssSoTurma = await carregarAssSoTurma(escolaId);
  const linhas = linhasTodas.filter((l) => !ehAssSoTurma(l, { turno: l.turno, nivelEnsino: l.nivelEnsino }));

  // [HA] Hora-Atividade obrigatoria do professor -- slots vazios na
  // grade (sem aula de nenhuma turma) que ainda assim sao
  // "ocupados" por HA, pra distinguir de horario realmente livre.
  const horasAtividadeBrutas = await db
    .select({
      diaSemana: disponibilidadeTable.diaSemana,
      numeroAula: disponibilidadeTable.horarioSlot,
      turno: disponibilidadeTable.turno, // [AGENDA-TURNOS]
      motivo: disponibilidadeTable.motivo, // [HA-OUTRO-TURNO]
    })
    .from(disponibilidadeTable)
    .where(
      and(
        eq(disponibilidadeTable.professorId, professor.id),
        eq(disponibilidadeTable.horaAtividadeObrigatoria, true),
      ),
    );

  // [HA-OUTRO-TURNO] devolve so a marca (HA de aulas de outro turno = HA*), nunca o motivo
  const horasAtividade = horasAtividadeBrutas.map(({ motivo, ...h }) => ({ ...h, outroTurno: ehHAOutroTurno(motivo) }));

  // [AGENDA-TURNOS] horario de inicio de cada aula, por turno (esquema de aulas da escola)
  const slots = await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));
  const horarios: Array<{ turno: string; numeroAula: number; horaInicio: string }> = [];
  for (const s of slots) {
    if (s.letivo === false) continue;
    const turnoS = String(s.turno ?? "");
    if (!horarios.some((h) => h.turno === turnoS && h.numeroAula === s.numeroAula)) {
      horarios.push({ turno: turnoS, numeroAula: s.numeroAula, horaInicio: String(s.horaInicio ?? "") });
    }
  }

  // [REVEZAMENTO-TRIO] aula de trio: presencial ou suporte nesta semana
  const revez = await mapaRevezamento([...new Set(linhas.map((l) => l.turmaId))], hojeBrasil());
  const aulas = linhas.map(({ turmaId, disciplinaId, ...l }) => ({
    ...l,
    trio: l.assincrona ? null : revez.get(`${turmaId}|${disciplinaId}|${professor.id}`) ?? null,
  }));
  return { aulas, horasAtividade, horarios, slots };
}
