const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%dispon%'`
    );
    console.log('Tabelas com "dispon" no nome:');
    for (const r of rows) console.log(`- ${r.table_name}`);
  } finally {
    await client.end();
  }
}
main();
