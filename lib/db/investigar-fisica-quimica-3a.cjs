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
    `SELECT id, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = '3A'`,
    [ESCOLA_ID]
  );

  const { rows } = await client.query(
    `SELECT td.id AS vinculo_id, d.id AS disciplina_id, d.nome AS disciplina, d.codigo_sae,
            p.nome AS professor, td.professor_id,
            im.carga_horaria_semanal AS carga_matriz, td.carga_horaria_semanal_override AS override
     FROM turma_disciplinas td
     JOIN disciplinas d ON d.id = td.disciplina_id
     LEFT JOIN professores p ON p.id = td.professor_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = $2 AND im.disciplina_id = td.disciplina_id
     WHERE td.turma_id = $1 AND (d.nome ILIKE '%física%' OR d.nome ILIKE '%química%')
     ORDER BY d.nome`,
    [turma[0].id, turma[0].matriz_curricular_id]
  );
  for (const r of rows) {
    console.log(`  vinculo_id=${r.vinculo_id} | disc_id=${r.disciplina_id} | "${r.disciplina}" (sae=${r.codigo_sae}) | professor="${r.professor}" | matriz=${r.carga_matriz} | override=${r.override}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
