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

  const { rows: professoresParecidos } = await client.query(
    `SELECT id, nome FROM professores WHERE escola_id = $1 AND (nome ILIKE '%camila%' OR nome ILIKE '%adalgisa%') ORDER BY nome`,
    [ESCOLA_ID]
  );
  console.log('Professores encontrados:');
  for (const p of professoresParecidos) console.log(`  id=${p.id} | "${p.nome}"`);

  console.log('\nVínculos atuais de Língua Portuguesa em 6E, 7C, 8A:');
  const { rows } = await client.query(
    `SELECT td.id AS vinculo_id, t.nome AS turma, p.nome AS professor_atual, td.professor_id
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     JOIN professores p ON p.id = td.professor_id
     WHERE t.escola_id = $1 AND t.nome IN ('6E', '7C', '8A') AND d.nome = 'Língua Portuguesa'`,
    [ESCOLA_ID]
  );
  for (const r of rows) console.log(`  vinculo_id=${r.vinculo_id} | ${r.turma} | professor atual: "${r.professor_atual}" (id=${r.professor_id})`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
