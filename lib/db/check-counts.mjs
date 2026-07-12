import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
try {
  await client.connect();
  const tables = ['escolas', 'usuarios', 'cursos', 'disciplinas', 'professores', 'turmas', 'matrizes_curriculares', 'horarios'];
  for (const t of tables) {
    const r = await client.query(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t}: ${r.rows[0].count} registros`);
  }
} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await client.end();
}