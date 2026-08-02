const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const colunas = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'disciplinas_catalogo'
      ORDER BY ordinal_position
    `);
    console.log("=== COLUNAS ===");
    console.table(colunas.rows);

    const total = await client.query("SELECT COUNT(*) FROM disciplinas_catalogo");
    console.log("Total de registros:", total.rows[0].count);

    const amostra = await client.query("SELECT * FROM disciplinas_catalogo LIMIT 15");
    console.log("=== AMOSTRA ===");
    console.table(amostra.rows);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
