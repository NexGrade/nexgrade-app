const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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
    `SELECT escola_id, turno, numero_aula, hora_inicio, duracao_minutos, nivel_ensino
     FROM horario_slots
     WHERE numero_aula = 0
     ORDER BY escola_id, turno`
  );
  console.log(`Registros com numero_aula = 0 em todas as escolas (${rows.length}):`);
  for (const r of rows) {
    console.log(`  escola=${r.escola_id}, turno=${r.turno}, hora=${r.hora_inicio}, duracao=${r.duracao_minutos}min, nivel=${r.nivel_ensino ?? 'geral'}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
