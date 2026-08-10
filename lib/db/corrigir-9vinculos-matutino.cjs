const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');

const CORRECOES = {
  5077: 'Lucas',
  5081: 'Michelle',
  5230: 'Lincon',
  5247: 'Adalgisa O F G',
  5248: 'Joao M S N',
  5249: 'Lucimeire F N C',
  5238: 'Adalgisa O F G',
  5239: 'Lucas',
  5240: 'Lucimeire F N C',
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

  const atualizacoes = [];
  for (const [vinculoId, nomeCorreto] of Object.entries(CORRECOES)) {
    const { rows: prof } = await client.query(
      `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2`,
      [ESCOLA_ID, nomeCorreto]
    );
    if (prof.length !== 1) {
      console.error(`ERRO: esperava 1 professor "${nomeCorreto}", achei ${prof.length}.`);
      await client.end();
      process.exit(1);
    }

    const { rows: vinculo } = await client.query(
      `SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.professor_id
       FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id
       JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE td.id = $1 AND t.escola_id = $2`,
      [vinculoId, ESCOLA_ID]
    );
    if (vinculo.length !== 1) {
      console.error(`ERRO: vinculo_id ${vinculoId} não encontrado.`);
      await client.end();
      process.exit(1);
    }
    if (vinculo[0].professor_id !== null) {
      console.error(`ERRO: vinculo_id ${vinculoId} já tem professor_id=${vinculo[0].professor_id}, não é NULL.`);
      await client.end();
      process.exit(1);
    }

    console.log(`  ${vinculo[0].turma} / ${vinculo[0].disciplina} (id=${vinculoId}): (sem professor) -> ${nomeCorreto}(${prof[0].id})`);
    atualizacoes.push({ vinculoId: Number(vinculoId), professorId: prof[0].id });
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const a of atualizacoes) {
      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [a.professorId, a.vinculoId]);
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
