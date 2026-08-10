const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MARIO_BRAGA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
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

  const { rows: colExistente } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'horario_slots' AND column_name = 'letivo'`
  );
  console.log(`\nColuna 'letivo' já existe? ${colExistente.length > 0 ? 'SIM' : 'NÃO'}`);

  const { rows: periodoZero } = await client.query(
    `SELECT id, escola_id, turno, numero_aula, hora_inicio FROM horario_slots WHERE numero_aula = 0`
  );
  console.log(`\nRegistros com numero_aula = 0 (${periodoZero.length}):`);
  for (const r of periodoZero) {
    const alvo = r.escola_id === MARIO_BRAGA_ID ? ' <- vai virar letivo=false' : ' <- fica letivo=true (padrão)';
    console.log(`  id=${r.id}, escola=${r.escola_id}, turno=${r.turno}${alvo}`);
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    if (colExistente.length === 0) {
      await client.query(`ALTER TABLE horario_slots ADD COLUMN letivo boolean NOT NULL DEFAULT true`);
    }
    await client.query(
      `UPDATE horario_slots SET letivo = false WHERE escola_id = $1 AND numero_aula = 0`,
      [MARIO_BRAGA_ID]
    );
    await client.query('COMMIT');
    console.log('\n✓ Coluna adicionada (se não existia) e Mário Braga marcado como não-letivo. Commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
