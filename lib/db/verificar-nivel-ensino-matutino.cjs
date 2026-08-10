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

  const { rows } = await client.query(
    `SELECT id, numero_aula, nivel_ensino, letivo FROM horario_slots WHERE escola_id = $1 AND turno = 'matutino' ORDER BY nivel_ensino, numero_aula`,
    [ESCOLA_ID]
  );
  console.log(`Total de linhas: ${rows.length}`);
  for (const r of rows) console.log(`  id=${r.id} | numero_aula=${r.numero_aula} | nivel_ensino=${r.nivel_ensino} | letivo=${r.letivo}`);

  const { rows: turmas } = await client.query(
    `SELECT nome, nivel_ensino FROM turmas WHERE escola_id = $1 AND turno = 'matutino' ORDER BY nome`,
    [ESCOLA_ID]
  );
  console.log('\nTurmas do matutino e seus níveis de ensino:');
  for (const t of turmas) console.log(`  ${t.nome}: ${t.nivel_ensino}`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
