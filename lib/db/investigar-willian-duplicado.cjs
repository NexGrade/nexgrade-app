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

  const { rows } = await client.query(
    `SELECT id, nome, email, escola_id, created_at FROM professores WHERE nome = 'Willian' ORDER BY id`
  );
  console.log(`Professores "Willian" (${rows.length}):`);
  for (const r of rows) console.log(`  id=${r.id}, email=${r.email}, escola=${r.escola_id}, criado=${r.created_at}`);

  for (const r of rows) {
    const { rows: td } = await client.query(
      `SELECT t.nome AS turma, d.nome AS disciplina FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE td.professor_id = $1`,
      [r.id]
    );
    console.log(`\n  Vínculos do id=${r.id} (${td.length}):`);
    for (const t of td) console.log(`    ${t.turma} / ${t.disciplina}`);

    const { rows: disp } = await client.query(
      `SELECT COUNT(*)::int AS n FROM disponibilidade_professores WHERE professor_id = $1`,
      [r.id]
    );
    console.log(`  Registros de disponibilidade: ${disp[0].n}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
