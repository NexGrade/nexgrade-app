import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query("SELECT tipo, COUNT(*) FROM calendario_escolar WHERE ano = 2026 GROUP BY tipo ORDER BY tipo");
console.log(r.rows);
await c.end();