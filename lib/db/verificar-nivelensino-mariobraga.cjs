const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MARIO_BRAGA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  console.log('=== horario_slots por turno + nivel_ensino ===');
  const { rows: slots } = await client.query(
    `SELECT turno, nivel_ensino, COUNT(*) AS qtd, MAX(numero_aula) AS max_aula
     FROM horario_slots WHERE escola_id = $1 AND letivo = true
     GROUP BY turno, nivel_ensino ORDER BY turno, nivel_ensino`,
    [MARIO_BRAGA_ID]
  );
  for (const s of slots) console.log(`  turno=${s.turno} | nivel_ensino=${s.nivel_ensino} | qtd=${s.qtd} | max_aula=${s.max_aula}`);

  console.log('\n=== Turmas por turno + nivel_ensino ===');
  const { rows: turmas } = await client.query(
    `SELECT turno, nivel_ensino, COUNT(*) AS qtd, STRING_AGG(nome, ', ' ORDER BY nome) AS nomes
     FROM turmas WHERE escola_id = $1
     GROUP BY turno, nivel_ensino ORDER BY turno, nivel_ensino`,
    [MARIO_BRAGA_ID]
  );
  for (const t of turmas) console.log(`  turno=${t.turno} | nivel_ensino=${t.nivel_ensino} | qtd=${t.qtd} | turmas=${t.nomes}`);

  console.log('\n=== Turmas SEM nivel_ensino definido ===');
  const { rows: semNivel } = await client.query(
    `SELECT nome, turno FROM turmas WHERE escola_id = $1 AND nivel_ensino IS NULL`,
    [MARIO_BRAGA_ID]
  );
  if (semNivel.length === 0) console.log('  Nenhuma -- todas as turmas têm nivel_ensino definido.');
  for (const t of semNivel) console.log(`  ${t.nome} (${t.turno})`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
