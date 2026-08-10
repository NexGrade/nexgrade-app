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

  const { rows } = await client.query(
    `SELECT h.id, t.nome AS turma, d.nome AS disciplina, h.dia_semana, h.numero_aula, h.created_at
     FROM horarios h
     JOIN turmas t ON t.id = h.turma_id
     JOIN disciplinas d ON d.id = h.disciplina_id
     WHERE h.professor_id = 820
     ORDER BY t.nome, h.dia_semana, h.numero_aula`
  );
  console.log(`Total: ${rows.length}`);
  for (const r of rows) {
    console.log(`  id=${r.id} | ${r.turma} | ${r.disciplina} | ${DIAS[r.dia_semana]} ${r.numero_aula}ª | criado=${r.created_at}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
