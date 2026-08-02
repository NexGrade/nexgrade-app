const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const colunas = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'turma_disciplinas' ORDER BY ordinal_position
    `);
    console.log("=== COLUNAS turma_disciplinas ===");
    console.table(colunas.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
