/**
 * checar-colunas-catalogo.cjs
 * Script somente leitura — lista as colunas de disciplinas_catalogo.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'disciplinas_catalogo' ORDER BY ordinal_position`
    );
    console.log('Colunas de disciplinas_catalogo:');
    for (const r of rows) console.log(`- ${r.column_name} (${r.data_type})`);
  } finally {
    await client.end();
  }
}
main();
