// Script pontual — registra a Hora-Atividade institucional que faltava
// pra Simone completar as 6 exigidas pela SEED-PR (ela tem 16 aulas na
// manhã, só 2 HA já marcadas lá; 16 ÷ 3 = 5,33 → 6 HA no total).
//
// A manhã da Simone está sem horário livre pra encaixar o resto (Seg/
// Ter/Qui com todos os 6 slots ocupados por aula), então as 4 HA que
// faltam foram combinadas pra ficar na TARDE de quinta-feira — isso
// foge da regra padrão de "mesma turno das aulas" (Art. 11, §4º), já
// que ela não tem aula nenhuma à tarde; documentado no `motivo` de cada
// linha pra ficar rastreável.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/registrar-ha-simone.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const MOTIVO = "Hora-Atividade institucional (tarde) — completa as 6 HA exigidas pela SEED-PR; sem horário livre na manhã (turno das aulas) pra encaixar";

// diaSemana: 0=segunda...4=sexta (convenção corrigida, ver fix-dia-semana.ts)
const QUINTA = 3;
// numeroAula na tarde: 1=13:05, 2=13:55, 3=14:45, 4=15:50, 5=16:40
const SLOTS_TARDE_QUINTA = [1, 2, 3, 4];

async function main() {
  console.log("🔧 Registrando HA institucional da Simone (tarde, quinta-feira)...\n");

  const [simone] = await db
    .select()
    .from(professoresTable)
    .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Simone")));

  if (!simone) {
    console.error('❌ Professor "Simone" não encontrado na escola_default.');
    await pool.end();
    process.exit(1);
  }

  // Confere se já não tem HA nesses slots (evita duplicar se rodar de novo)
  const existentes = await db
    .select()
    .from(disponibilidadeTable)
    .where(eq(disponibilidadeTable.professorId, simone.id));

  let criadas = 0;
  for (const slot of SLOTS_TARDE_QUINTA) {
    const jaExiste = existentes.some(
      (d) => d.diaSemana === QUINTA && d.horarioSlot === slot && d.turno === "vespertino" && d.horaAtividadeObrigatoria
    );
    if (jaExiste) {
      console.log(`⏭️  Já existe HA em quinta, slot ${slot} (tarde) — pulado`);
      continue;
    }
    await db.insert(disponibilidadeTable).values({
      professorId: simone.id,
      diaSemana: QUINTA,
      horarioSlot: slot,
      disponivel: true,
      turno: "vespertino",
      horaAtividadeObrigatoria: true,
      motivo: MOTIVO,
    });
    criadas++;
    console.log(`✅ HA criada: quinta, slot ${slot} (tarde)`);
  }

  console.log(`\n🎉 ${criadas} slot(s) de HA institucional criados pra Simone.`);
  console.log("   Total de HA institucional dela agora: 2 (manhã, já existentes) + " + criadas + " (tarde, novas) = " + (2 + criadas));
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
