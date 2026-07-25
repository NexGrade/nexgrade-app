// Script pontual — corrige a atribuição da Simone: ela só dá aula das
// disciplinas ADM/DES (AMSIS, RH, NEGOC., ORGAN., CONFIN, AD.ORÇ,
// DADOS1). O bloco de L.POR/LP.TEX que tínhamos sincronizado com o
// nome dela por engano (vindo do CSV original) NÃO é dela -- remove
// essas 3 HA erradas, mantendo só as 2 reais confirmadas.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/corrigir_simone_v2.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "matutino";

// As UNICAS 2 HA reais da Simone (ADM/DES): Segunda 09:25 (aula 3),
// Segunda 10:15 (aula 4).
const HA_REAIS_SIMONE = new Set(["0-3", "0-4"]);

async function main() {
  const [simone] = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Simone")));

  if (!simone) {
    console.error('❌ Não encontrei professor "Simone".');
    await pool.end();
    process.exit(1);
  }

  const existentes = await db.select().from(disponibilidadeTable)
    .where(and(eq(disponibilidadeTable.professorId, simone.id), eq(disponibilidadeTable.turno, TURNO)));

  let removidas = 0;
  for (const row of existentes) {
    if (!row.horaAtividadeObrigatoria) continue;
    const chave = `${row.diaSemana}-${row.horarioSlot}`;
    if (!HA_REAIS_SIMONE.has(chave)) {
      await db.delete(disponibilidadeTable).where(eq(disponibilidadeTable.id, row.id));
      removidas++;
      console.log(`✅ Removida HA errada: dia ${row.diaSemana}, aula ${row.horarioSlot}`);
    }
  }

  console.log(`\n📊 ${removidas} HA errada(s) removida(s) da Simone.`);
  console.log("🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
