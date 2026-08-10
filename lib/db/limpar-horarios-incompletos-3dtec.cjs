const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');

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

  const { rows: turma } = await client.query(
    `SELECT id FROM turmas WHERE escola_id = $1 AND nome = '3D TEC'`,
    [ESCOLA_ID]
  );
  const { rows } = await client.query(
    `SELECT id FROM horarios WHERE turma_id = $1`,
    [turma[0].id]
  );
  console.log(`\nHorários da 3D TEC a apagar: ${rows.length}`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para apagar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(`DELETE FROM horarios WHERE turma_id = $1`, [turma[0].id]);
    await client.query('COMMIT');
    console.log('\n✓ Apagado e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
