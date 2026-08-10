const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MARIO_BRAGA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const APLICAR = process.argv.includes('--aplicar');
const NOME_CORRETO = 'C.E. Prof. Mário B.T. Braga';

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

  const { rows } = await client.query(`SELECT nome_fantasia FROM escolas WHERE id = $1`, [MARIO_BRAGA_ID]);
  console.log(`  Atual: "${rows[0].nome_fantasia}"`);
  console.log(`  Novo:  "${NOME_CORRETO}"`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(`UPDATE escolas SET nome_fantasia = $1 WHERE id = $2`, [NOME_CORRETO, MARIO_BRAGA_ID]);
    await client.query('COMMIT');
    console.log('\n✓ Corrigido e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
