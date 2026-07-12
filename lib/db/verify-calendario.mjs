import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
for (const t of ['calendario_escolar', 'trimestres_letivos']) {
  const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t]);
  console.log(`=== ${t} ===`);
  r.rows.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));
}
await c.end();