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

  const { rows: slots } = await client.query(
    `SELECT numero_aula, hora_inicio, duracao_minutos, nivel_ensino
     FROM horario_slots WHERE escola_id = $1 AND turno = 'noturno'
     ORDER BY numero_aula`,
    [ESCOLA_ID]
  );
  console.log(`Períodos configurados no noturno: ${slots.length}`);
  for (const s of slots) console.log(`  Aula ${s.numero_aula}: ${s.hora_inicio} (${s.duracao_minutos}min) nivel=${s.nivel_ensino ?? 'geral'}`);

  const totalSemanal = slots.length * 5;
  console.log(`\nTotal de slots por semana (${slots.length} aulas/dia x 5 dias): ${totalSemanal}`);
  console.log(`Carga horária cadastrada na 3D TEC: 30h`);
  if (totalSemanal < 30) {
    console.log(`\n⚠ IMPOSSÍVEL: só existem ${totalSemanal} slots por semana, mas a turma precisa de 30h. Por isso o CP-SAT reporta inviável.`);
  } else {
    console.log(`\nCapacidade suficiente em teoria (${totalSemanal} >= 30) — o problema deve ser outra restrição (disponibilidade de professor, etc.)`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
