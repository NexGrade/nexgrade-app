const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  await client.query("UPDATE escolas SET isenta = true WHERE id = $1", ["escola_default"]);
  const r = await client.query("SELECT id, nome_fantasia, isenta FROM escolas");
  console.table(r.rows);
  await client.end();
});
