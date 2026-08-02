const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `))
  .then(res => { console.table(res.rows); return client.end(); })
  .catch(err => { console.error(err); return client.end(); });
