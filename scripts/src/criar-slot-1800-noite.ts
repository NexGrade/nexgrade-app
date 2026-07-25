// Script pontual — cria o slot "informativo" das 18:00 no turno
// noturno (numeroAula=0, fora do esquema oficial de 5 aulas, que
// começa às 18:45) e marca as 3 HA reais confirmadas na grade real
// (22/06 a 26/06, verificado por coordenadas do PDF original) que
// caem exatamente nesse horário.
//
// Esse slot fica protegido: routes/horario-slots.ts nunca apaga
// numeroAula=0 ao salvar o assistente de Esquema normal (só mexe em
// 1..N). Seguro rodar de novo se precisar recriar.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/criar-slot-1800-noite.ts

import { db, pool } from "@workspace/db";
import { horarioSlotsTable, professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "noturno";

// (professor, diaSemana 0-4) confirmado por coordenadas do PDF real
const HA_1800_REAL: Array<[string, number]> = [
  ["ANTONIO SILVA", 1], // Terça
  ["ELIANE", 2],        // Quarta
  ["ELIANE", 3],        // Quinta
];

async function main() {
  console.log("🔧 Criando slot informativo 18:00 (noturno) e marcando HA real...\n");

  const [slotExistente] = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.escolaId, ESCOLA_ID), eq(horarioSlotsTable.turno, TURNO), eq(horarioSlotsTable.numeroAula, 0)));

  if (!slotExistente) {
    await db.insert(horarioSlotsTable).values({
      escolaId: ESCOLA_ID,
      turno: TURNO,
      nivelEnsino: null,
      numeroAula: 0,
      horaInicio: "18:00:00",
      duracaoMinutos: 45,
    });
    console.log("✅ Slot 18:00 (numeroAula=0) criado no turno noturno.");
  } else {
    console.log("⏭️  Slot 18:00 já existia, não recriei.");
  }

  for (const [nomeCsv, dia] of HA_1800_REAL) {
    const todos = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
    const professor = todos.find((p) => p.nome.toLowerCase().startsWith(nomeCsv.toLowerCase()));
    if (!professor) {
      console.log(`⚠️  Não encontrei professor pra "${nomeCsv}" — pulei`);
      continue;
    }

    const [jaExiste] = await db.select().from(disponibilidadeTable)
      .where(and(
        eq(disponibilidadeTable.professorId, professor.id),
        eq(disponibilidadeTable.turno, TURNO),
        eq(disponibilidadeTable.diaSemana, dia),
        eq(disponibilidadeTable.horarioSlot, 0),
      ));

    if (jaExiste) {
      if (!jaExiste.horaAtividadeObrigatoria) {
        await db.update(disponibilidadeTable)
          .set({ horaAtividadeObrigatoria: true, disponivel: true, motivo: "HA real às 18:00, confirmada na grade 22/06-26/06" })
          .where(eq(disponibilidadeTable.id, jaExiste.id));
        console.log(`✅ ${professor.nome}: HA das 18:00 corrigida`);
      } else {
        console.log(`⏭️  ${professor.nome}: já estava marcado`);
      }
    } else {
      await db.insert(disponibilidadeTable).values({
        professorId: professor.id,
        diaSemana: dia,
        horarioSlot: 0,
        disponivel: true,
        turno: TURNO,
        horaAtividadeObrigatoria: true,
        motivo: "HA real às 18:00, confirmada na grade 22/06-26/06",
      });
      console.log(`✅ ${professor.nome}: HA das 18:00 marcada`);
    }
  }

  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
