import pg from 'pg';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();

const sqlPath = 'drizzle/0002_sour_wendigo.sql';
let sql = readFileSync(sqlPath, 'utf-8');
sql = sql.replace(/^\uFEFF/, '');

try {
  await c.query('BEGIN');
  await c.query(sql);

  const hash = createHash('sha256').update(sql).digest('hex');
  const now = Date.now();
  await c.query(
    'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
    [hash, now]
  );

  await c.query('COMMIT');
  console.log('✅ Coluna visivel_publicamente criada e migration registrada.');
} catch (err) {
  await c.query('ROLLBACK');
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await c.end();
}