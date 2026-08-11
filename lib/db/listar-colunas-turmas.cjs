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
    console.log(`\n=== Colunas de turmas ===`);
    const res = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'turmas'
       ORDER BY ordinal_position`
    );
    for (const row of res.rows) {
      console.log(`  ${row.column_name} (${row.data_type})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
