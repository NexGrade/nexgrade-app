// Script pontual — corrige um erro meu: o script anterior
// (completar_ha_final.ts) aplicou a troca de nome Anderson/Andre,
// Andreia/Antonio Silva errada -- essas 4 pessoas já estavam
// corretamente identificadas na extração direta do PDF (só
// Rafael/Priscila realmente precisava da troca). Isso inseriu HA
// erradas pra Anderson, Andre, Andreia e Antonio Silva. Remove só
// essas células específicas, sem mexer em mais nada.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/corrigir_erro_swap_tarde.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "vespertino";

// (nome, diaSemana, numeroAula) -- celulas erradas inseridas por engano
const REMOVER: Array<[string, number, number]> = [
  ["ANDERSON", 1, 4],
  ["ANDERSON", 3, 1],
  ["ANDERSON", 4, 3],
  ["ANDERSON", 4, 4],
  ["ANDRE", 0, 3],
  ["ANDREIA", 2, 1],
  ["ANDREIA", 2, 3],
  ["ANDREIA", 3, 2],
  ["ANDREIA", 3, 3],
  ["ANDREIA", 4, 2],
  ["ANTONIO SILVA", 2, 2],
];

async function buscarProfessorPorNome(nomeCsv: string) {
  const todos = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const exato = todos.find((p) => p.nome.toLowerCase() === nomeCsv.toLowerCase());
  if (exato) return exato;
  const parcial = todos.filter((p) => p.nome.toLowerCase().startsWith(nomeCsv.toLowerCase()));
  if (parcial.length === 1) return parcial[0];
  return null;
}

async function main() {
  console.log("🔧 Corrigindo HA inseridas por engano (Anderson/Andre/Andreia/Antonio Silva)...\n");

  let removidas = 0;
  for (const [nomePdf, dia, aula] of REMOVER) {
    const professor = await buscarProfessorPorNome(nomePdf);
    if (!professor) {
      console.log(`⚠️  Não encontrei professor pra "${nomePdf}"`);
      continue;
    }
    const [row] = await db.select().from(disponibilidadeTable)
      .where(and(
        eq(disponibilidadeTable.professorId, professor.id),
        eq(disponibilidadeTable.turno, TURNO),
        eq(disponibilidadeTable.diaSemana, dia),
        eq(disponibilidadeTable.horarioSlot, aula),
      ));
    if (row && row.horaAtividadeObrigatoria) {
      await db.delete(disponibilidadeTable).where(eq(disponibilidadeTable.id, row.id));
      removidas++;
      console.log(`✅ ${professor.nome}: removida HA errada dia ${dia}, aula ${aula}`);
    } else {
      console.log(`⏭️  ${professor.nome}: dia ${dia}, aula ${aula} já não estava marcado como HA`);
    }
  }

  console.log(`\n📊 ${removidas} HA errada(s) removida(s).`);
  console.log("🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
