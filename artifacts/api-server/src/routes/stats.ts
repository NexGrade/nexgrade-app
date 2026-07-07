import { Router } from "express";
import { db } from "@workspace/db";
import {
  professoresTable, turmasTable, disciplinasTable, horariosTable,
  salasTable, licencasTable, comunicadosTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const [professores, turmas, disciplinas, horarios, salas, licencas, comunicados] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(salasTable).where(eq(salasTable.escolaId, escolaId)),
    db.select().from(licencasTable).where(eq(licencasTable.escolaId, escolaId)),
    db.select().from(comunicadosTable).where(eq(comunicadosTable.escolaId, escolaId)),
  ]);

  const turmasComHorario = new Set(horarios.map(h => h.turmaId));
  const turmasSemHorario = turmas.filter(t => !turmasComHorario.has(t.id)).length;

  const slotMap: Record<string, number[]> = {};
  horarios.forEach(h => {
    const key = `${h.professorId}-${h.diaSemana}-${h.numeroAula}`;
    if (!slotMap[key]) slotMap[key] = [];
    slotMap[key]!.push(h.id);
  });
  let totalConflitos = 0;
  Object.values(slotMap).forEach(ids => {
    if (ids.length > 1) totalConflitos += ids.length - 1;
  });

  const hoje = new Date().toISOString().split("T")[0]!;
  const licencasAtivas = licencas.filter(l => l.dataInicio <= hoje && l.dataFim >= hoje).length;
  const comunicadosNaoLidos = comunicados.filter(c => !c.lida).length;

  res.json({
    totalProfessores: professores.length,
    totalTurmas: turmas.length,
    totalDisciplinas: disciplinas.length,
    turmasSemHorario,
    totalConflitos,
    aulasDistribuidas: horarios.length,
    totalSalas: salas.length,
    licencasAtivas,
    comunicadosNaoLidos,
  });
});

export default router;
