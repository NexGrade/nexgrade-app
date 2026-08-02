const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const total = await client.query("SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1", ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]);
    const comSigla = await client.query("SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1 AND sigla IS NOT NULL", ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]);
    const semSigla = await client.query("SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1 AND sigla IS NULL", ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]);
    console.log("Total disciplinas (Mario Braga):", total.rows[0].count);
    console.log("Com sigla preenchida:", comSigla.rows[0].count);
    console.log("Sem sigla (null):", semSigla.rows[0].count);
    const amostra = await client.query("SELECT nome, sigla FROM disciplinas WHERE escola_id = $1 ORDER BY nome LIMIT 10", ["org_3HCMsuYeAwkggR1dxXNzEdzNaX8"]);
    console.table(amostra.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
