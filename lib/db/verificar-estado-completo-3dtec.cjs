const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
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

  const { rows: turma } = await client.query(
    `SELECT id FROM turmas WHERE escola_id = $1 AND nome = '3D TEC'`,
    [ESCOLA_ID]
  );
  const turmaId = turma[0].id;

  const { rows } = await client.query(
    `SELECT h.id, d.nome AS disciplina, p.nome AS professor, h.dia_semana, h.numero_aula, h.created_at
     FROM horarios h
     JOIN disciplinas d ON d.id = h.disciplina_id
     LEFT JOIN professores p ON p.id = h.professor_id
     WHERE h.turma_id = $1
     ORDER BY h.dia_semana, h.numero_aula`,
    [turmaId]
  );
  console.log(`Total de horários oficiais da 3D TEC: ${rows.length}`);
  for (const r of rows) {
    console.log(`  id=${r.id} | ${DIAS[r.dia_semana]} ${r.numero_aula}ª | ${r.disciplina} / ${r.professor} | criado=${r.created_at}`);
  }

  const { rows: exp } = await client.query(
    `SELECT DISTINCT nome FROM horarios_experimentais WHERE turma_id = $1`,
    [turmaId]
  );
  console.log(`\nExperimentos existentes: ${exp.map((e) => e.nome).join(', ') || '(nenhum)'}`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
