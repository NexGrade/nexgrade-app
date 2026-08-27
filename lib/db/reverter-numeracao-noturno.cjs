// REVERTE a correção anterior: soma 1 de volta em cada numero_aula das
// aulas do noturno, restaurando o esquema de 6 linhas (1=vago/18:00,
// 2 a 6 = aulas reais 18:45-22:10), como o usuário confirmou que quer.
//
// Uso:
//   node reverter-numeracao-noturno.cjs            → dry-run (ROLLBACK)
//   node reverter-numeracao-noturno.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const antes = await client.query(`
      SELECT numero_aula, COUNT(*)::int AS total
      FROM horarios h JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = 'noturno'
      GROUP BY numero_aula ORDER BY numero_aula
    `, [ESCOLA_ID]);
    console.log("Antes (deve estar 1-5):", JSON.stringify(antes.rows));

    const resultado = await client.query(`
      UPDATE horarios h
      SET numero_aula = numero_aula + 1
      FROM turmas t
      WHERE h.turma_id = t.id AND h.escola_id = $1 AND t.turno = 'noturno'
      RETURNING h.id
    `, [ESCOLA_ID]);
    console.log(`Linhas atualizadas: ${resultado.rowCount}`);

    const depois = await client.query(`
      SELECT numero_aula, COUNT(*)::int AS total
      FROM horarios h JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = 'noturno'
      GROUP BY numero_aula ORDER BY numero_aula
    `, [ESCOLA_ID]);
    console.log("Depois (deve estar 2-6):", JSON.stringify(depois.rows));

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — rode com --aplicar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
