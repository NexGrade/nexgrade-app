import { calcularHAIdeal } from "../artifacts/api-server/src/lib/recalcular-ha";
import { db, horariosTable, turmasTable, professoresTable } from "@workspace/db";
import { eq, and, notInArray } from "drizzle-orm";

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const alecksey = (await db.select().from(professoresTable).where(
    and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Alecksey"))
  ))[0];

  const turmasMatutino = await db.select().from(turmasTable).where(
    and(eq(turmasTable.escolaId, ESCOLA_ID), eq(turmasTable.turno, "matutino"))
  );
  const idsMatutino = turmasMatutino.map((t) => t.id);

  const aulasReais = await db.select().from(horariosTable).where(
    and(eq(horariosTable.escolaId, ESCOLA_ID), eq(horariosTable.professorId, alecksey.id))
  );
  const aulasMatutino = aulasReais.filter((a) => idsMatutino.includes(a.turmaId));

  // [FIX] mescla com as aulas oficiais das turmas FORA do escopo do
  // experimento (mesma logica que acabei de aplicar em export.ts)
  const slotsForaDoEscopo = await db
    .select({ turmaId: horariosTable.turmaId, professorId: horariosTable.professorId, diaSemana: horariosTable.diaSemana, numeroAula: horariosTable.numeroAula })
    .from(horariosTable)
    .where(and(eq(horariosTable.escolaId, ESCOLA_ID), notInArray(horariosTable.turmaId, idsMatutino)));

  const override = [
    ...aulasMatutino.map((a) => ({ professorId: a.professorId, turmaId: a.turmaId, diaSemana: a.diaSemana, numeroAula: a.numeroAula })),
    ...slotsForaDoEscopo,
  ];

  console.log(`Override total: ${override.length} (matutino: ${aulasMatutino.length}, fora do escopo/oficial: ${slotsForaDoEscopo.length})`);

  const resultado = await calcularHAIdeal(ESCOLA_ID, override);
  const resultadoAlecksey = resultado.filter((m) => m.professorId === alecksey.id);
  console.log(`\nMarcas de HA pro Alecksey: ${resultadoAlecksey.length}`);
  const porTurno: Record<string, number> = {};
  resultadoAlecksey.forEach((m) => { porTurno[m.turno] = (porTurno[m.turno] ?? 0) + 1; });
  console.log("Por turno:", porTurno);
  console.log(resultadoAlecksey.filter((m) => m.turno === "matutino"));

  process.exit(0);
}
main().catch((err) => { console.error("ERRO:", err); process.exit(1); });
