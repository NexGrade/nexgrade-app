import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC');
r.rows.forEach(m => console.log(`#${m.id} | ${m.hash} | ${new Date(Number(m.created_at)).toISOString()}`));
await c.end();