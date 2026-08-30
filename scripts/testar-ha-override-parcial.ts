// Testa calcularHAIdeal com um override PARCIAL (so matutino), igual
// o que acontece de verdade quando se gera um experimento so do
// matutino via CP-SAT, pra reproduzir o bug relatado (PDF experimental
// nao mostra HA nenhuma).
import { calcularHAIdeal } from "../artifacts/api-server/src/lib/recalcular-ha";
import { db, horariosTable, turmasTable, professoresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const alecksey = (await db.select().from(professoresTable).where(
    and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Alecksey"))
  ))[0];
  console.log("Alecksey id:", alecksey?.id);

  // pega as aulas REAIS do matutino dele (simulando o override que o
  // export.ts monta a partir do experimento)
  const turmasMatutino = await db.select().from(turmasTable).where(
    and(eq(turmasTable.escolaId, ESCOLA_ID), eq(turmasTable.turno, "matutino"))
  );
  const idsMatutino = new Set(turmasMatutino.map((t) => t.id));

  const aulasReais = await db.select().from(horariosTable).where(
    and(eq(horariosTable.escolaId, ESCOLA_ID), eq(horariosTable.professorId, alecksey.id))
  );
  const aulasMatutino = aulasReais.filter((a) => idsMatutino.has(a.turmaId));
  console.log(`Aulas reais do Alecksey no matutino: ${aulasMatutino.length}`);

  const override = aulasMatutino.map((a) => ({
    professorId: a.professorId,
    turmaId: a.turmaId,
    diaSemana: a.diaSemana,
    numeroAula: a.numeroAula,
  }));

  console.log("\n--- Chamando calcularHAIdeal com override SO matutino ---");
  const resultado = await calcularHAIdeal(ESCOLA_ID, override);
  const resultadoAlecksey = resultado.filter((m) => m.professorId === alecksey.id);
  console.log(`Marcas de HA retornadas pro Alecksey: ${resultadoAlecksey.length}`);
  console.log(resultadoAlecksey);

  process.exit(0);
}
main().catch((err) => { console.error("ERRO:", err); process.exit(1); });
