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
    `SELECT id, numero_aula, hora_inicio, duracao_minutos, letivo, nivel_ensino
     FROM horario_slots
     WHERE escola_id = $1 AND turno = 'noturno'
     ORDER BY numero_aula`,
    [ESCOLA_ID]
  );
  console.log(`Períodos noturno Arlinda agora: ${rows.length}`);
  for (const r of rows) {
    console.log(`  id=${r.id}, aula=${r.numero_aula}, hora=${r.hora_inicio}, duracao=${r.duracao_minutos}min, letivo=${r.letivo}, nivel=${r.nivel_ensino ?? '—'}`);
  }

  // checa se ha turmas/horarios ja gravados que dependem dos numeroAula atuais
  const { rows: turmasNoturno } = await client.query(
    `SELECT id, nome FROM turmas WHERE escola_id = $1 AND turno = 'noturno'`,
    [ESCOLA_ID]
  );
  console.log(`\nTurmas do noturno: ${turmasNoturno.map((t) => t.nome).join(', ')}`);

  for (const t of turmasNoturno) {
    const { rows: horariosExistentes } = await client.query(
      `SELECT COUNT(*)::int AS n FROM horarios WHERE turma_id = $1`,
      [t.id]
    );
    const { rows: experimentaisExistentes } = await client.query(
      `SELECT COUNT(*)::int AS n FROM horarios_experimentais WHERE turma_id = $1`,
      [t.id]
    );
    console.log(`  ${t.nome}: ${horariosExistentes[0].n} horarios oficiais, ${experimentaisExistentes[0].n} experimentais`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
