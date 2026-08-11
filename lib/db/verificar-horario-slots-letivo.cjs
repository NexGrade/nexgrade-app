const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log("=== Colunas de horario_slots ===");
    const colsRes = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'horario_slots' ORDER BY ordinal_position`
    );
    for (const r of colsRes.rows) console.log(`  ${r.column_name} (${r.data_type})`);

    console.log("\n=== Slots do Mário Braga, noturno (todos os níveis) ===");
    const amostraRes = await client.query(
      `SELECT * FROM horario_slots WHERE escola_id = $1 AND turno = 'noturno' ORDER BY nivel_ensino, numero_aula`,
      ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]
    );
    for (const r of amostraRes.rows) console.log(" ", JSON.stringify(r));

    console.log("\n=== Contagem de slots letivos por turno+nivel_ensino (Mário Braga) — capacidade semanal = count * 5 dias ===");
    const contagemRes = await client.query(
      `SELECT turno, nivel_ensino, COUNT(*) FILTER (WHERE letivo = true) AS slots_letivos, COUNT(*) AS total_slots
       FROM horario_slots
       WHERE escola_id = $1
       GROUP BY turno, nivel_ensino
       ORDER BY turno, nivel_ensino`,
      ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]
    );
    for (const r of contagemRes.rows) {
      console.log(`  turno=${r.turno} nivel_ensino=${r.nivel_ensino} slots_letivos=${r.slots_letivos} (${r.slots_letivos * 5}h/semana) total_slots=${r.total_slots}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
