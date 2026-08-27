const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mário B.T. Braga

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(
      "SELECT id, nome, email, cpf, matricula, ativo FROM professores WHERE escola_id = $1 ORDER BY nome",
      [ESCOLA_ID]
    );
    console.log(`Total: ${rows.rows.length}\n`);
    console.log(JSON.stringify(rows.rows, null, 2));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
