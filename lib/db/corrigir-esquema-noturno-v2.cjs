// Corrige o esquema (horario_slots) do noturno pra usar a MESMA numeração
// que a tabela horarios: 1=vago(18:00), 2=18:45, 3=19:35, 4=20:35,
// 5=21:25, 6=22:10 (chronológico direto, sem pular o vago).
// Renumera os 6 registros existentes (soma 1 em cada) e depois confirma
// que ficaram 6 linhas 1-6 com o vago sendo o 1.
//
// Uso:
//   node corrigir-esquema-noturno-v2.cjs            → dry-run (ROLLBACK)
//   node corrigir-esquema-noturno-v2.cjs --aplicar   → aplica de verdade (COMMIT)

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

    const antes = await client.query(
      `SELECT id, numero_aula, hora_inicio, letivo FROM horario_slots WHERE escola_id = $1 AND turno = 'noturno' ORDER BY numero_aula`,
      [ESCOLA_ID]
    );
    console.log("Antes:", JSON.stringify(antes.rows, null, 2));

    // renumera do maior pro menor pra nao colidir com UNIQUE constraint (se existir)
    const ordenado = [...antes.rows].sort((a, b) => b.numero_aula - a.numero_aula);
    for (const row of ordenado) {
      await client.query(`UPDATE horario_slots SET numero_aula = numero_aula + 1 WHERE id = $1`, [row.id]);
    }

    console.log("\n(A renumeração sozinha já produz as 6 linhas certas -- sem inserir nada novo.)");

    const depois = await client.query(
      `SELECT id, numero_aula, hora_inicio, letivo FROM horario_slots WHERE escola_id = $1 AND turno = 'noturno' ORDER BY numero_aula`,
      [ESCOLA_ID]
    );
    console.log("\nDepois (esperado: 1=vago/18:00, 2=18:45 ... 6=22:10):");
    console.log(JSON.stringify(depois.rows, null, 2));

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
