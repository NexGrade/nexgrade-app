const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const VINCULOS = [4946, 4956];

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

  for (const id of VINCULOS) {
    const { rows } = await client.query(
      `SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.carga_horaria_semanal_override AS override
       FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id
       JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE td.id = $1`,
      [id]
    );
    if (rows.length !== 1) { console.error(`ERRO: vinculo ${id} não encontrado.`); await client.end(); process.exit(1); }
    console.log(`  ${rows[0].turma} / "${rows[0].disciplina}" (override=${rows[0].override}) -> APAGAR`);
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(`DELETE FROM turma_disciplinas WHERE id = ANY($1::int[])`, [VINCULOS]);
    await client.query('COMMIT');
    console.log('\n✓ Apagado e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
