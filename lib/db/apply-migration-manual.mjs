import pg from 'pg';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();

const sqlPath = 'drizzle/0001_huge_fantastic_four.sql';
let sql = readFileSync(sqlPath, 'utf-8');
sql = sql.replace(/^\uFEFF/, ''); // remove BOM se existir

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
  console.log('✅ Tabelas criadas e migration registrada com sucesso.');
  console.log('Hash:', hash);
} catch (err) {
  await c.query('ROLLBACK');
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await c.end();
}