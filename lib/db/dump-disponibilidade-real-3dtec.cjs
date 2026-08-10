const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'];
const PROFESSORES = ['Lucas', 'Cinara', 'Willian B', 'Mayra', 'Willian', 'Deilza S B K', 'Jose E F', 'Alex S G', 'Rafaela', 'Simone Baros'];

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  for (const nome of PROFESSORES) {
    const { rows: prof } = await client.query(
      `SELECT id FROM professores WHERE nome = $1 AND escola_id = $2`,
      [nome, ESCOLA_ID]
    );
    if (prof.length !== 1) {
      console.log(`\n${nome}: ERRO, achou ${prof.length}`);
      continue;
    }
    const profId = prof[0].id;

    const { rows: disp } = await client.query(
      `SELECT dia_semana, horario_slot, disponivel FROM disponibilidade_professores
       WHERE professor_id = $1 AND turno = 'noturno' ORDER BY dia_semana, horario_slot`,
      [profId]
    );

    // monta a grade visual: livre (nenhum registro OU disponivel=true) vs bloqueado (disponivel=false)
    const grade = {};
    for (let d = 0; d < 5; d++) grade[d] = { 1: 'livre', 2: 'livre', 3: 'livre', 4: 'livre', 5: 'livre', 6: 'livre' };
    for (const r of disp) {
      if (grade[r.dia_semana]) grade[r.dia_semana][r.horario_slot] = r.disponivel ? 'livre(registro true)' : 'BLOQUEADO';
    }

    console.log(`\n=== ${nome} (id=${profId}) ===`);
    for (let d = 0; d < 5; d++) {
      const linha = [1, 2, 3, 4, 5, 6].map((a) => `${a}:${grade[d][a] === 'livre' ? '.' : grade[d][a] === 'BLOQUEADO' ? 'X' : 'T'}`).join(' ');
      console.log(`  ${DIAS[d].padEnd(8)} ${linha}`);
    }
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
