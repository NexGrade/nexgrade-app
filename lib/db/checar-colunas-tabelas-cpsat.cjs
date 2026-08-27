/**
 * checar-colunas-tabelas-cpsat.cjs
 * Script SOMENTE LEITURA -- lista colunas das tabelas usadas pelo
 * runCpsatGeneration, pra montar o payload real com precisao.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const envPathAlt = path.join('lib', 'db', '.env');
  const p = fs.existsSync(envPath) ? envPath : envPathAlt;
  const conteudo = fs.readFileSync(p, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const TABELAS = [
  'turmas', 'turma_disciplinas', 'disciplinas', 'professores',
  'disponibilidade', 'horario_slots', 'professor_disciplinas',
  'itens_matriz', 'configuracoes',
];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    for (const tabela of TABELAS) {
      const { rows } = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [tabela]
      );
      console.log(`\n=== ${tabela} ===`);
      if (rows.length === 0) {
        console.log('  (tabela não encontrada com esse nome)');
      } else {
        for (const r of rows) console.log(`  - ${r.column_name} (${r.data_type})`);
      }
    }
  } finally {
    await client.end();
  }
}
main();
