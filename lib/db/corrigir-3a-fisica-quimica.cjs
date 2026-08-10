const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const REMOVER_OVERRIDE = [5047];
const APAGAR_VINCULO = [5048, 5049, 5054];

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

  console.log('\n=== Remover override (volta a usar a matriz real) ===');
  for (const id of REMOVER_OVERRIDE) {
    const { rows } = await client.query(
      `SELECT td.id, d.nome, td.carga_horaria_semanal_override FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id WHERE td.id = $1`,
      [id]
    );
    if (rows.length !== 1) { console.error(`ERRO: vinculo ${id} não encontrado.`); await client.end(); process.exit(1); }
    console.log(`  id=${id} | "${rows[0].nome}" | override atual=${rows[0].carga_horaria_semanal_override} -> NULL`);
  }

  console.log('\n=== Apagar vínculos fantasma ===');
  for (const id of APAGAR_VINCULO) {
    const { rows } = await client.query(
      `SELECT td.id, d.nome FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id WHERE td.id = $1`,
      [id]
    );
    if (rows.length !== 1) { console.error(`ERRO: vinculo ${id} não encontrado.`); await client.end(); process.exit(1); }
    console.log(`  id=${id} | "${rows[0].nome}" -> APAGAR`);
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const id of REMOVER_OVERRIDE) {
      await client.query(`UPDATE turma_disciplinas SET carga_horaria_semanal_override = NULL WHERE id = $1`, [id]);
    }
    for (const id of APAGAR_VINCULO) {
      await client.query(`DELETE FROM turma_disciplinas WHERE id = $1`, [id]);
    }
    await client.query('COMMIT');
    console.log(`\n✓ Corrigido e commitado.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
