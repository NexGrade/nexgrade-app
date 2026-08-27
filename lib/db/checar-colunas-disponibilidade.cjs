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
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'disponibilidade_professores' ORDER BY ordinal_position`
    );
    console.log('Colunas de disponibilidade_professores:');
    for (const r of rows) console.log(`- ${r.column_name} (${r.data_type})`);
  } finally {
    await client.end();
  }
}
main();
