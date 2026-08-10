const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'];

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows: prof } = await client.query(`SELECT id, nome FROM professores WHERE nome = 'Simone Baros'`);
  console.log('Professor:', prof);
  if (prof.length !== 1) {
    console.error('Não achou exatamente 1 "Simone Baros".');
    await client.end();
    return;
  }
  const profId = prof[0].id;

  const { rows: disp } = await client.query(
    `SELECT dia_semana, horario_slot, disponivel, motivo, turno, hora_atividade_obrigatoria
     FROM disponibilidade_professores WHERE professor_id = $1 ORDER BY turno, dia_semana, horario_slot`,
    [profId]
  );
  console.log(`\nTotal de registros de disponibilidade: ${disp.length}`);
  for (const d of disp) {
    console.log(`  turno=${d.turno ?? 'geral'}, ${DIAS[d.dia_semana]} ${d.horario_slot}ª — disponivel=${d.disponivel}, motivo="${d.motivo ?? ''}"${d.hora_atividade_obrigatoria ? ' [HA]' : ''}`);
  }

  if (disp.length === 0) {
    console.log('\n⚠ NENHUM registro de disponibilidade — pela convenção do sistema (ausência de registro = disponível), ela aparece como livre TODOS os dias/horários. Isso explica por que o CP-SAT a usou em qualquer dia.');
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
