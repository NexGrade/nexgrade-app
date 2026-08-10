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

  const { rows: turmas } = await client.query(
    `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND turno = 'matutino' ORDER BY nome`,
    [ESCOLA_ID]
  );

  for (const t of turmas) {
    const { rows } = await client.query(
      `SELECT COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, d.carga_semanal, 0) AS efetivo
       FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id
       LEFT JOIN itens_matriz im ON im.matriz_curricular_id = $2 AND im.disciplina_id = td.disciplina_id
       WHERE td.turma_id = $1`,
      [t.id, t.matriz_curricular_id]
    );
    const total = rows.reduce((s, r) => s + Number(r.efetivo), 0);
    const marca = total > 30 ? ' ⚠ AINDA EXCEDE' : '';
    console.log(`  ${t.nome}: ${total}h${marca}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
