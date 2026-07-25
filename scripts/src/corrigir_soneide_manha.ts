// Script pontual — a HA que tínhamos atribuído erroneamente à "Simone"
// (conteúdo de L.POR/LP.TEX: 2MA EM, 3MA ADM) na verdade pertence à
// Soneide, confirmado por coordenadas do PDF (nome "SONEIDE" aparece
// diretamente acima dessa tabela na página 12).
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/corrigir_soneide_manha.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "matutino";
// (diaSemana 0-4, numeroAula 1-6): Quarta 09:25 (aula 3), Quarta 11:05
// (aula 5), Terça 11:55 (aula 6)
const HA_REAIS_SONEIDE: Array<[number, number]> = [
  [2, 3],
  [2, 5],
  [1, 6],
];

async function main() {
  const [soneide] = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Soneide")));

  if (!soneide) {
    console.error('❌ Não encontrei professor "Soneide".');
    await pool.end();
    process.exit(1);
  }

  for (const [dia, aula] of HA_REAIS_SONEIDE) {
    const [jaExiste] = await db.select().from(disponibilidadeTable)
      .where(and(
        eq(disponibilidadeTable.professorId, soneide.id),
        eq(disponibilidadeTable.turno, TURNO),
        eq(disponibilidadeTable.diaSemana, dia),
        eq(disponibilidadeTable.horarioSlot, aula),
      ));
    if (jaExiste) {
      if (!jaExiste.horaAtividadeObrigatoria) {
        await db.update(disponibilidadeTable)
          .set({ horaAtividadeObrigatoria: true, disponivel: true, motivo: "HA real confirmada (disciplinas L.POR/LP.TEX da Soneide, manhã)" })
          .where(eq(disponibilidadeTable.id, jaExiste.id));
        console.log(`✅ Corrigido dia ${dia}, aula ${aula}`);
      } else {
        console.log(`⏭️  Já estava marcado: dia ${dia}, aula ${aula}`);
      }
    } else {
      await db.insert(disponibilidadeTable).values({
        professorId: soneide.id,
        diaSemana: dia,
        horarioSlot: aula,
        disponivel: true,
        turno: TURNO,
        horaAtividadeObrigatoria: true,
        motivo: "HA real confirmada (disciplinas L.POR/LP.TEX da Soneide, manhã)",
      });
      console.log(`✅ Adicionado dia ${dia}, aula ${aula}`);
    }
  }

  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
