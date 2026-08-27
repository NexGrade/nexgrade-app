const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(
      "SELECT id, nome, email FROM professores WHERE nome ILIKE $1 OR nome ILIKE $2 OR nome ILIKE $3",
      ["%katia%", "%kacia%", "%katya%"]
    );
    console.log(JSON.stringify(r.rows, null, 2));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
