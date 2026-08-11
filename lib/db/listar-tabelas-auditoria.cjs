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
    console.log("=== Tabelas com nome relacionado a auditoria/log ===");
    const res = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND (table_name ILIKE '%audit%' OR table_name ILIKE '%log%')
       ORDER BY table_name`
    );
    for (const row of res.rows) {
      console.log(`  ${row.table_name}`);
    }

    // Se achou alguma, mostra as colunas da primeira
    if (res.rows.length > 0) {
      const tabela = res.rows[0].table_name;
      console.log(`\n=== Colunas de ${tabela} ===`);
      const colsRes = await client.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = $1
         ORDER BY ordinal_position`,
        [tabela]
      );
      for (const row of colsRes.rows) {
        console.log(`  ${row.column_name} (${row.data_type})`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
