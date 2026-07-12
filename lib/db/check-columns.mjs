import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const tables = ['disciplinas', 'turma_disciplinas', 'disponibilidade_professores'];

  for (const table of tables) {
    console.log(`=== Colunas de "${table}" ===`);
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    cols.rows.forEach((c) => console.log(`  - ${c.column_name} (${c.data_type})`));
    console.log('');
  }
} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await client.end();
}