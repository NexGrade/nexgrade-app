import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const r1 = await c.query('SELECT COUNT(*) FROM horario_slots');
const r2 = await c.query('SELECT COUNT(*) FROM aulas_fixas');
console.log('horario_slots:', r1.rows[0].count);
console.log('aulas_fixas:', r2.rows[0].count);
await c.end();