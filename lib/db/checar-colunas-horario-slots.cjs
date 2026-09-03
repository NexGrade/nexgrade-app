// SO LEITURA -- lista as colunas reais da tabela horario_slots.
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const r = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'horario_slots' ORDER BY ordinal_position`
  );
  console.log("Colunas de horario_slots:");
  r.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  // mostra uma linha de exemplo tambem
  const exemplo = await client.query(`SELECT * FROM horario_slots LIMIT 1`);
  console.log("\nExemplo de linha:");
  console.log(exemplo.rows[0]);

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
