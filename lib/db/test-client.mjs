import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Conectado!');
  const r1 = await client.query('SELECT 1 as ok');
  console.log('Query 1 OK:', r1.rows);
  const r2 = await client.query('SELECT 2 as ok');
  console.log('Query 2 OK:', r2.rows);
} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await client.end();
}