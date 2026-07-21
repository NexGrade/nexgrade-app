import { Router } from "express";
import { db } from "@workspace/db";
import {
  professoresTable, turmasTable, disciplinasTable, horariosTable,
  salasTable, licencasTable, comunicadosTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { detectarConflitos } from "./conflitos";

const router = Router();

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const [professores, turmas, disciplinas, horarios, salas, licencas, comunicados, conflitos] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(salasTable).where(eq(salasTable.escolaId, escolaId)),
    db.select().from(licencasTable).where(eq(licencasTable.escolaId, escolaId)),
    db.select().from(comunicadosTable).where(eq(comunicadosTable.escolaId, escolaId)),
    // [FIX] Antes tinha uma lógica própria aqui, copiada e colada, que
    // detectava "professor duplicado" sem levar o turno em conta (o
    // mesmo bug que já corrigimos em routes/conflitos.ts -- aula 1 da
    // manhã e aula 1 da tarde contando como o mesmo horário). Como eram
    // duas implementações separadas da mesma coisa, corrigir uma não
    // corrigia a outra. Agora reusa a função de detecção real, a mesma
    // que a aba Conflitos usa -- uma fonte de verdade só.
    detectarConflitos(escolaId),
  ]);

  const turmasComHorario = new Set(horarios.map(h => h.turmaId));
  const turmasSemHorario = turmas.filter(t => !turmasComHorario.has(t.id)).length;

  const hoje = new Date().toISOString().split("T")[0]!;
  const licencasAtivas = licencas.filter(l => l.dataInicio <= hoje && l.dataFim >= hoje).length;
  const comunicadosNaoLidos = comunicados.filter(c => !c.lida).length;

  res.json({
    totalProfessores: professores.length,
    totalTurmas: turmas.length,
    totalDisciplinas: disciplinas.length,
    turmasSemHorario,
    totalConflitos: conflitos.length,
    aulasDistribuidas: horarios.length,
    totalSalas: salas.length,
    licencasAtivas,
    comunicadosNaoLidos,
  });
});

export default router;
