const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT nome, COUNT(*) AS linhas, MIN(created_at) AS mais_antigo, MAX(created_at) AS mais_recente
      FROM horarios_experimentais
      WHERE escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'
      GROUP BY nome
      ORDER BY mais_recente DESC
    `);
    console.table(rows.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
