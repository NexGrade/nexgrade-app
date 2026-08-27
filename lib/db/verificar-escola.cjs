const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query("SELECT * FROM escolas WHERE id = $1", [ESCOLA_ID]);
    console.log(`Linhas encontradas para escola_id=${ESCOLA_ID}: ${rows.rows.length}`);
    console.log(JSON.stringify(rows.rows, null, 2));

    const todas = await client.query("SELECT id, nome FROM escolas");
    console.log(`\nTotal de escolas cadastradas no sistema: ${todas.rows.length}`);
    console.log(JSON.stringify(todas.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
