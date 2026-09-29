import { Router } from "express";
import { db } from "@workspace/db";
import {
  professoresTable, turmasTable, disciplinasTable, horariosTable,
  salasTable, licencasTable, comunicadosTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
// [DISC-EM-USO] mesmo criterio da aba Disciplinas: em alguma turma, na matriz de um curso ofertado, ou avulsa
async function contarDisciplinasEmUso(escolaId: string): Promise<number> {
  const r: any = await db.execute(sql`
    select count(*)::int n from disciplinas d
    where d.escola_id = ${escolaId} and (
      exists (select 1 from turma_disciplinas td join turmas t on t.id = td.turma_id
              where td.disciplina_id = d.id and t.escola_id = ${escolaId})
      or exists (select 1 from itens_matriz i join matrizes_curriculares m on m.id = i.matriz_curricular_id
                 join cursos c on c.id = m.curso_id
                 where i.disciplina_id = d.id and c.escola_id = ${escolaId} and c.ofertado)
      or not exists (select 1 from itens_matriz i join matrizes_curriculares m on m.id = i.matriz_curricular_id
                     where i.disciplina_id = d.id and m.escola_id = ${escolaId})
    )`);
  return Number((r?.rows ?? r ?? [])[0]?.n ?? 0);
}
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
    totalDisciplinas: await contarDisciplinasEmUso(escolaId), // [DISC-EM-USO]
    turmasSemHorario,
    totalConflitos: conflitos.length,
    aulasDistribuidas: horarios.length,
    totalSalas: salas.length,
    licencasAtivas,
    comunicadosNaoLidos,
  });
});

export default router;
