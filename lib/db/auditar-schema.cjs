// auditar-schema.cjs
// Script SOMENTE LEITURA — não altera nada no banco.
// Lista tabelas e colunas relacionadas a professores, disciplinas, turmas, aulas e matriz curricular.
//
// Uso:
//   node lib\db\auditar-schema.cjs > schema-output.txt 2>&1

const fs = require('fs');
const { Client } = require('pg');

function getDatabaseUrl() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error('DATABASE_URL não encontrada no arquivo .env');
  }
  let url = match[1].trim();
  url = url.replace(/^["']|["']$/g, ''); // remove aspas se houver
  return url;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Conectado ao banco.\n');
  console.log('=== Tabelas relacionadas a professores/disciplinas/turmas/aulas/matriz ===');

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name ILIKE '%professor%' OR
        table_name ILIKE '%disciplina%' OR
        table_name ILIKE '%turma%' OR
        table_name ILIKE '%aula%' OR
        table_name ILIKE '%matriz%' OR
        table_name ILIKE '%curriculo%' OR
        table_name ILIKE '%curricular%' OR
        table_name ILIKE '%horario%'
      )
    ORDER BY table_name;
  `);

  if (tablesRes.rows.length === 0) {
    console.log('Nenhuma tabela encontrada com esses termos. Verifique o schema manualmente.');
  }

  for (const row of tablesRes.rows) {
    console.log(`\n--- ${row.table_name} ---`);
    const colsRes = await client.query(
      `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `,
      [row.table_name]
    );
    for (const col of colsRes.rows) {
      console.log(
        `  ${col.column_name} (${col.data_type}${col.is_nullable === 'NO' ? ', NOT NULL' : ''})`
      );
    }

    const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM "${row.table_name}";`);
    console.log(`  [total de linhas: ${countRes.rows[0].total}]`);
  }

  await client.end();
  console.log('\nFim da auditoria de schema.');
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
