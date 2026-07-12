import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
await c.query("UPDATE planos SET visivel_publicamente = false WHERE nome = 'Master'");
const r = await c.query("SELECT id, nome, visivel_publicamente FROM planos ORDER BY id");
console.log(r.rows);
await c.end();