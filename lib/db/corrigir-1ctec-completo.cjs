const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const APAGAR = [4966];
const REMOVER_OVERRIDE = [4968, 4969, 4971, 4975, 4978];

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

  console.log('\n=== Apagar (duplicata) ===');
  for (const id of APAGAR) {
    const { rows } = await client.query(
      `SELECT td.id, d.nome, td.carga_horaria_semanal_override AS override
       FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id WHERE td.id = $1`,
      [id]
    );
    if (rows.length !== 1) { console.error(`ERRO: vinculo ${id} não encontrado.`); await client.end(); process.exit(1); }
    console.log(`  id=${id} | "${rows[0].nome}" (override=${rows[0].override}) -> APAGAR`);
  }

  console.log('\n=== Remover override (1h -> matriz real 2h) ===');
  for (const id of REMOVER_OVERRIDE) {
    const { rows } = await client.query(
      `SELECT td.id, d.nome, td.carga_horaria_semanal_override AS override
       FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id WHERE td.id = $1`,
      [id]
    );
    if (rows.length !== 1) { console.error(`ERRO: vinculo ${id} não encontrado.`); await client.end(); process.exit(1); }
    console.log(`  id=${id} | "${rows[0].nome}" (override atual=${rows[0].override}) -> NULL`);
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(`DELETE FROM turma_disciplinas WHERE id = ANY($1::int[])`, [APAGAR]);
    for (const id of REMOVER_OVERRIDE) {
      await client.query(`UPDATE turma_disciplinas SET carga_horaria_semanal_override = NULL WHERE id = $1`, [id]);
    }
    await client.query('COMMIT');
    console.log('\n✓ Corrigido e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
