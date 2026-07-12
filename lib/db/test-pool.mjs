import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => console.error('POOL ERROR:', err.message));

try {
  console.log('Query 1...');
  const r1 = await pool.query('SELECT 1 as ok');
  console.log('Query 1 OK:', r1.rows);

  console.log('Query 2 (imediata)...');
  const r2 = await pool.query('SELECT 2 as ok');
  console.log('Query 2 OK:', r2.rows);
} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await pool.end();
}