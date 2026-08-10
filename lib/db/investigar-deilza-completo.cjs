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

  const { rows: prof } = await client.query(
    `SELECT id FROM professores WHERE escola_id = $1 AND nome = 'Deilza S B K'`,
    [ESCOLA_ID]
  );
  const profId = prof[0].id;

  const { rows } = await client.query(
    `SELECT td.id AS vinculo_id, t.nome AS turma, d.nome AS disciplina, d.codigo_sae,
            im.carga_horaria_semanal AS carga_matriz, td.carga_horaria_semanal_override AS override
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE td.professor_id = $1 AND t.turno = 'matutino'
     ORDER BY t.nome, d.nome`,
    [profId]
  );
  let total = 0;
  for (const r of rows) {
    const efetivo = r.override ?? r.carga_matriz ?? 0;
    total += Number(efetivo);
    console.log(`  ${r.turma} / "${r.disciplina}" (sae=${r.codigo_sae}) | matriz=${r.carga_matriz} | override=${r.override} | EFETIVO=${efetivo}`);
  }
  console.log(`\nTotal efetivo: ${total}h`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
