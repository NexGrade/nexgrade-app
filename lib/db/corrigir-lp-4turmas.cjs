const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');

const CORRECOES = {
  '6D': 'Camila F.',
  '6E': 'Camila F.',
  '7C': 'Camila F.',
  '8A': 'Taisson',
};

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');

  const { rows: adalgisa } = await client.query(
    `SELECT id FROM professores WHERE escola_id = $1 AND nome = 'Adalgisa O F G'`,
    [ESCOLA_ID]
  );
  const adalgisaId = adalgisa[0].id;

  const atualizacoes = [];
  for (const [turma, professorCorreto] of Object.entries(CORRECOES)) {
    const { rows: prof } = await client.query(
      `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2`,
      [ESCOLA_ID, professorCorreto]
    );
    if (prof.length !== 1) {
      console.error(`ERRO: esperava 1 professor "${professorCorreto}", achei ${prof.length}.`);
      await client.end();
      process.exit(1);
    }
    const professorCorretoId = prof[0].id;

    const { rows: vinculo } = await client.query(
      `SELECT td.id AS vinculo_id, d.nome AS disciplina, td.professor_id AS professor_atual
       FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id
       JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE t.escola_id = $1 AND t.nome = $2 AND d.nome ILIKE '%portugu%'`,
      [ESCOLA_ID, turma]
    );
    if (vinculo.length !== 1) {
      console.error(`ERRO: esperava 1 vínculo de LP em ${turma}, achei ${vinculo.length}.`);
      await client.end();
      process.exit(1);
    }
    if (vinculo[0].professor_atual !== null) {
      console.error(`ERRO: ${turma} já tem professor_id=${vinculo[0].professor_atual} definido, não é NULL como esperado. Parando por segurança.`);
      await client.end();
      process.exit(1);
    }
    console.log(`  ${turma}: vinculo_id=${vinculo[0].vinculo_id} | "${vinculo[0].disciplina}" | (sem professor) -> ${professorCorreto}(${professorCorretoId})`);
    atualizacoes.push({ vinculoId: vinculo[0].vinculo_id, professorCorretoId, turma });
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const a of atualizacoes) {
      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [a.professorCorretoId, a.vinculoId]);
    }
    await client.query('COMMIT');
    console.log(`\n✓ ${atualizacoes.length} vínculo(s) corrigido(s) e commitado(s).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
