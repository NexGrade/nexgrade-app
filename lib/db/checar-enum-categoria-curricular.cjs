// checar-enum-categoria-curricular.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname IN (
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'itens_matriz' AND column_name = 'categoria_curricular'
      )
      ORDER BY e.enumsortorder
    `);
    console.log('Valores válidos de categoria_curricular:');
    console.table(res.rows);

    // Distribuição real de uso por escola, pra ver o padrão de quando usar cada valor
    const usoRes = await client.query(`
      SELECT mc.escola_id, im.categoria_curricular, COUNT(*)
      FROM itens_matriz im
      JOIN matrizes_curriculares mc ON mc.id = im.matriz_curricular_id
      GROUP BY mc.escola_id, im.categoria_curricular
      ORDER BY mc.escola_id, im.categoria_curricular
    `);
    console.log('\nDistribuição de uso atual (todas as escolas):');
    console.table(usoRes.rows);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
