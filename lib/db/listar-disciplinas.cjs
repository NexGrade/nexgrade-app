const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(
      "SELECT id, nome FROM disciplinas WHERE escola_id = $1 ORDER BY nome",
      ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]
    );
    console.log(JSON.stringify(rows.rows, null, 2));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
