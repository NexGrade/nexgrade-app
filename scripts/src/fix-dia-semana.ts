// Script de correção pontual — os dados gravados em `horarios` e
// `disponibilidade_professores` (pelo seed-horarios.ts) usaram a
// convenção `diaSemana: 1=segunda...5=sexta`, mas o código de
// exportação (export.ts, array `DIAS` indexado a partir de 0) espera
// `diaSemana: 0=segunda...4=sexta`. Esse desencontro fazia a Segunda
// aparecer vazia e a Sexta sumir da grade exportada em PDF.
//
// Este script SUBTRAI 1 de cada diaSemana já gravado, pra alinhar com
// a convenção que o export.ts (e o restante do app) já usa.
//
// Seguro rodar mais de uma vez? NÃO — só rode uma vez. Se rodar de novo
// depois de já corrigido, vai subtrair 1 de novo e quebrar os dados
// (diaSemana ficaria -1..3 em vez de 0..4). O script confere isso antes
// de aplicar e recusa rodar se já detectar diaSemana=0 (sinal de que já
// foi corrigido).
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/fix-dia-semana.ts

import { db, pool } from "@workspace/db";
import { horariosTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";

async function main() {
  console.log("🔧 Corrigindo diaSemana (1-5 → 0-4) em horarios e disponibilidade...\n");

  const horariosAtuais = await db.select().from(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID));
  const jaTemZero = horariosAtuais.some((h) => h.diaSemana === 0);
  if (jaTemZero) {
    console.log("⚠️  Já existem registros com diaSemana=0 — parece que essa correção já foi aplicada.");
    console.log("   Nada foi alterado, pra evitar corrigir duas vezes.");
    await pool.end();
    return;
  }

  const foraDoRange = horariosAtuais.filter((h) => h.diaSemana < 1 || h.diaSemana > 5);
  if (foraDoRange.length > 0) {
    console.log(`⚠️  ${foraDoRange.length} registros de horarios com diaSemana fora do esperado (1-5) — pulei a correção geral, revise manualmente:`);
    foraDoRange.slice(0, 10).forEach((h) => console.log("   ", h));
    await pool.end();
    return;
  }

  await db.execute(sql`UPDATE horarios SET dia_semana = dia_semana - 1 WHERE escola_id = ${ESCOLA_ID}`);
  console.log(`✅ ${horariosAtuais.length} registros de horarios corrigidos`);

  // disponibilidade_professores não tem escola_id direto (é por
  // professor_id) -- filtra pelas que a gente marcou como HA
  // institucional real (motivo específico do seed-horarios.ts), pra não
  // mexer em nenhuma outra indisponibilidade que já existisse antes.
  const haAtuais = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.horaAtividadeObrigatoria, true));
  const haRelevantes = haAtuais.filter((d) => d.motivo === "Hora-atividade institucional (grade real 22/06 a 26/06)");
  await db.execute(sql`
    UPDATE disponibilidade_professores
    SET dia_semana = dia_semana - 1
    WHERE hora_atividade_obrigatoria = true
      AND motivo = 'Hora-atividade institucional (grade real 22/06 a 26/06)'
  `);
  console.log(`✅ ${haRelevantes.length} registros de disponibilidade (HA institucional) corrigidos`);

  console.log("\n🎉 Correção concluída. diaSemana agora é 0=segunda...4=sexta, igual ao export.ts.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro ao corrigir diaSemana:", err);
  process.exit(1);
});
