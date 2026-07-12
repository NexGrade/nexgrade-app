import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log('=== Escola ===');
const escola = await c.query("SELECT id, nome_fantasia, cidade, estado FROM escolas WHERE id = 'escola_default'");
console.log(escola.rows);

console.log('\n=== Trimestres 2026 ===');
const trimestres = await c.query("SELECT trimestre, data_inicio, data_fim, dias_letivos FROM trimestres_letivos WHERE ano = 2026 ORDER BY trimestre");
console.log(trimestres.rows);

console.log('\n=== Eventos por tipo ===');
const eventos = await c.query("SELECT tipo, COUNT(*) as total, MIN(data) as primeira, MAX(data) as ultima FROM calendario_escolar WHERE ano = 2026 GROUP BY tipo ORDER BY tipo");
console.log(eventos.rows);

console.log('\n=== Total dias letivos ===');
const total = await c.query("SELECT SUM(dias_letivos) as total FROM trimestres_letivos WHERE ano = 2026");
console.log(total.rows);

await c.end();