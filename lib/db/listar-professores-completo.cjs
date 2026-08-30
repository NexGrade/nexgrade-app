const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1 ORDER BY nome`,
      [ESCOLA_ID]
    );
    console.log(JSON.stringify(r.rows));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
