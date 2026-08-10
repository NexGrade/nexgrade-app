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

  for (const turma of ['6D', '6E', '7C', '8A']) {
    const { rows } = await client.query(
      `SELECT td.id AS vinculo_id, d.nome AS disciplina, d.codigo_sae, p.nome AS professor, td.professor_id
       FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id
       JOIN disciplinas d ON d.id = td.disciplina_id
       LEFT JOIN professores p ON p.id = td.professor_id
       WHERE t.escola_id = $1 AND t.nome = $2 AND d.nome ILIKE '%portugu%'`,
      [ESCOLA_ID, turma]
    );
    console.log(`=== ${turma} ===`);
    for (const r of rows) console.log(`  vinculo_id=${r.vinculo_id} | "${r.disciplina}" (sae=${r.codigo_sae}) | professor: "${r.professor}" (id=${r.professor_id})`);
    if (rows.length === 0) console.log('  (nenhum vínculo de Português encontrado)');
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
