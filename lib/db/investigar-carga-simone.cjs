const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows: prof } = await client.query(`SELECT id, nome, escola_id FROM professores WHERE nome = 'Simone Baros'`);
  console.log('Professor:', prof);
  const profId = prof[0].id;

  console.log('\n=== turma_disciplinas (todas as turmas) ===');
  const { rows: td } = await client.query(
    `SELECT t.nome AS turma, t.turno, d.nome AS disciplina, im.carga_horaria_semanal AS horas
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE td.professor_id = $1
     ORDER BY t.nome`,
    [profId]
  );
  let total = 0;
  for (const r of td) {
    console.log(`  ${r.turma} (${r.turno}) / ${r.disciplina}: ${r.horas}h`);
    total += Number(r.horas || 0);
  }
  console.log(`  TOTAL (soma de itens_matriz): ${total}h`);

  console.log('\n=== horarios (grade oficial já gravada) ===');
  const { rows: h } = await client.query(
    `SELECT t.nome AS turma, COUNT(*)::int AS n
     FROM horarios h JOIN turmas t ON t.id = h.turma_id
     WHERE h.professor_id = $1 GROUP BY t.nome`,
    [profId]
  );
  for (const r of h) console.log(`  ${r.turma}: ${r.n} aulas`);

  console.log('\n=== horarios_experimentais (qualquer experimento) ===');
  const { rows: he } = await client.query(
    `SELECT t.nome AS turma, h.nome AS experimento, COUNT(*)::int AS n
     FROM horarios_experimentais h JOIN turmas t ON t.id = h.turma_id
     WHERE h.professor_id = $1 GROUP BY t.nome, h.nome`,
    [profId]
  );
  for (const r of he) console.log(`  ${r.turma} / "${r.experimento}": ${r.n} aulas`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
