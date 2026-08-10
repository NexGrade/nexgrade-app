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

  const { rows: config } = await client.query(
    `SELECT chave, valor FROM configuracoes WHERE escola_id = $1 AND chave LIKE '%geminad%'`,
    [ESCOLA_ID]
  );
  console.log('Configuração de geminadas da escola:', config.length ? config : '(nenhuma -- usa o padrão do código, que é 2)');

  const { rows: turma } = await client.query(
    `SELECT id FROM turmas WHERE escola_id = $1 AND nome = '3D TEC'`,
    [ESCOLA_ID]
  );
  const { rows: td } = await client.query(
    `SELECT d.nome, td.max_aulas_consecutivas_dia, im.carga_horaria_semanal AS horas
     FROM turma_disciplinas td
     JOIN disciplinas d ON d.id = td.disciplina_id
     JOIN turmas t ON t.id = td.turma_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE td.turma_id = $1
     ORDER BY d.nome`,
    [turma[0].id]
  );
  console.log('\nDisciplinas da 3D TEC (max_aulas_consecutivas_dia):');
  for (const r of td) console.log(`  ${r.nome}: ${r.horas}h/semana, max_consecutivas=${r.max_aulas_consecutivas_dia ?? '(padrão da escola)'}`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
