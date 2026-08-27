const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const rows = (await client.query(
      `SELECT nome, COUNT(*) AS total, COUNT(DISTINCT turma_id) AS turmas FROM horarios_experimentais
       WHERE escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8' GROUP BY nome ORDER BY nome`
    )).rows;
    console.log('Experimentos existentes agora:');
    for (const r of rows) console.log(`  "${r.nome}" -- ${r.total} aulas, ${r.turmas} turmas`);
    if (rows.length === 0) console.log('  Nenhum experimento salvo no momento.');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
