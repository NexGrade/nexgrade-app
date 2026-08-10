const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows: discs } = await client.query(
    `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 AND (nome ILIKE '%filosofia%' OR nome ILIKE '%sociologia%') ORDER BY nome`,
    [ESCOLA_ID]
  );
  console.log('Disciplinas de Filosofia/Sociologia no catálogo:');
  for (const d of discs) console.log(`  id=${d.id} | "${d.nome}" (sae=${d.codigo_sae})`);

  const { rows: profs } = await client.query(
    `SELECT id, nome FROM professores WHERE escola_id = $1 AND (nome ILIKE '%eucledio%' OR nome ILIKE '%will%') ORDER BY nome`,
    [ESCOLA_ID]
  );
  console.log('\nProfessores:');
  for (const p of profs) console.log(`  id=${p.id} | "${p.nome}"`);

  const { rows: turma } = await client.query(
    `SELECT id, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = '2B'`,
    [ESCOLA_ID]
  );
  console.log(`\n2B: turma_id=${turma[0].id}, matriz_curricular_id=${turma[0].matriz_curricular_id}`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
