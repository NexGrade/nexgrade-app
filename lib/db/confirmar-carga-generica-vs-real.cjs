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

  const { rows: turma } = await client.query(
    `SELECT id, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = '3D TEC'`,
    [ESCOLA_ID]
  );

  const { rows } = await client.query(
    `SELECT d.nome, d.carga_semanal AS carga_generica_disciplina,
            td.carga_horaria_semanal_override AS override_na_turma,
            im.carga_horaria_semanal AS carga_real_matriz
     FROM turma_disciplinas td
     JOIN disciplinas d ON d.id = td.disciplina_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = $2 AND im.disciplina_id = td.disciplina_id
     WHERE td.turma_id = $1
     ORDER BY d.nome`,
    [turma[0].id, turma[0].matriz_curricular_id]
  );
  console.log('Disciplina | genérica | override | real (matriz)');
  for (const r of rows) {
    const bate = String(r.carga_generica_disciplina) === String(r.carga_real_matriz);
    console.log(`  ${r.nome}: generica=${r.carga_generica_disciplina}, override=${r.override_na_turma ?? 'NULL'}, real=${r.carga_real_matriz} ${bate ? '' : '⚠ DIFERENTE'}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
