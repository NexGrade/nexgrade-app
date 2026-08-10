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

  for (const turmaNome of ['6A', '6B', '6C', '6D', '6E']) {
    const { rows: turma } = await client.query(
      `SELECT id, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = $2`,
      [ESCOLA_ID, turmaNome]
    );
    const { rows } = await client.query(
      `SELECT d.nome, COALESCE(im.carga_horaria_semanal, td.carga_horaria_semanal_override) AS horas
       FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id
       LEFT JOIN itens_matriz im ON im.matriz_curricular_id = $2 AND im.disciplina_id = td.disciplina_id
       WHERE td.turma_id = $1`,
      [turma[0].id, turma[0].matriz_curricular_id]
    );
    const total = rows.reduce((s, r) => s + Number(r.horas || 0), 0);
    console.log(`${turmaNome}: total matriz = ${total}h (${rows.length} disciplinas)`);
    for (const r of rows) console.log(`    ${r.nome}: ${r.horas}h`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
