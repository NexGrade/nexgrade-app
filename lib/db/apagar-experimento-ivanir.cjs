const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const antes = await client.query(
      `SELECT COUNT(*) FROM horarios_experimentais WHERE escola_id = $1 AND nome = $2`,
      ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8", "Regen-Ivanir-2026-07-30"]
    );
    console.log("Linhas a apagar:", antes.rows[0].count);

    const del = await client.query(
      `DELETE FROM horarios_experimentais WHERE escola_id = $1 AND nome = $2`,
      ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8", "Regen-Ivanir-2026-07-30"]
    );
    console.log("Linhas apagadas:", del.rowCount);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
