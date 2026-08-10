const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ARLINDA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const MARIO_BRAGA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

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
    `SELECT id, nome, email, escola_id, created_at FROM professores WHERE nome = 'Will' ORDER BY id`
  );
  console.log(`Professores "Will" (todas as escolas, ${rows.length}):`);
  for (const r of rows) console.log(`  id=${r.id}, email=${r.email}, escola_id=${r.escola_id}, criado=${r.created_at}`);

  for (const r of rows) {
    console.log(`\n--- Detalhe id=${r.id} (escola=${r.escola_id}) ---`);
    const { rows: pd } = await client.query(
      `SELECT d.nome, d.id AS disciplina_id FROM professor_disciplinas pd
       JOIN disciplinas d ON d.id = pd.disciplina_id WHERE pd.professor_id = $1`,
      [r.id]
    );
    console.log(`  Disciplinas vinculadas (professor_disciplinas): ${pd.map((d) => `${d.nome} (id=${d.disciplina_id}, escola_id_da_disciplina=?)`).join(', ')}`);

    const { rows: td } = await client.query(
      `SELECT t.nome AS turma, t.escola_id AS turma_escola, d.nome AS disciplina
       FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE td.professor_id = $1`,
      [r.id]
    );
    console.log(`  Vínculos turma_disciplinas: ${td.length}`);
    for (const t of td) console.log(`    ${t.turma} (escola=${t.turma_escola}) / ${t.disciplina}`);
  }

  // confirma se as disciplinas ligadas pertencem a escola certa
  console.log('\n--- Checando escola_id das disciplinas "Sociologia" e "Sociologia Gov Cid Sociedade" ---');
  const { rows: discs } = await client.query(
    `SELECT id, nome, escola_id FROM disciplinas WHERE nome ILIKE '%sociologia%' ORDER BY nome, escola_id`
  );
  for (const d of discs) console.log(`  id=${d.id}, nome="${d.nome}", escola_id=${d.escola_id}`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
