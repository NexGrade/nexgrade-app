import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  console.log('=== Migrations aplicadas (drizzle.__drizzle_migrations) ===');
  const migrations = await client.query(`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at ASC
  `);
  migrations.rows.forEach((m) => {
    console.log(`  #${m.id} | ${String(m.hash).slice(0, 12)}... | ${new Date(Number(m.created_at)).toISOString()}`);
  });
  console.log(`Total: ${migrations.rows.length} migrations registradas\n`);

  console.log('=== Tabelas existentes no schema public ===');
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  tables.rows.forEach((t) => console.log(`  - ${t.table_name}`));
  console.log(`Total: ${tables.rows.length} tabelas\n`);

  console.log('=== Verificando colunas específicas das últimas alterações ===');
  const checks = [
    { table: 'disciplinas', column: 'tipoSalaExigido' },
    { table: 'turma_disciplinas', column: 'maxAulasConsecutivasDia' },
    { table: 'turma_disciplinas', column: 'grupoCompartilhadoId' },
    { table: 'disponibilidade_professores', column: 'horaAtividadeObrigatoria' },
    { table: 'disponibilidade_professores', column: 'turno' },
    { table: 'configuracoes', column: null },
  ];

  for (const check of checks) {
    if (check.column === null) {
      const exists = tables.rows.some((t) => t.table_name === check.table);
      console.log(`  ${exists ? '✓' : '✗'} tabela "${check.table}" ${exists ? 'existe' : 'NÃO ENCONTRADA'}`);
      continue;
    }
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [check.table, check.column]
    );
    console.log(`  ${cols.rows.length > 0 ? '✓' : '✗'} ${check.table}.${check.column} ${cols.rows.length > 0 ? 'existe' : 'NÃO ENCONTRADA'}`);
  }

  console.log('\n=== Verificação concluída ===');
} catch (err) {
  console.error('ERRO NA VERIFICAÇÃO:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
