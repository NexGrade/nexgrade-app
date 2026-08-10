const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MARIO_BRAGA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows } = await client.query(`SELECT * FROM escolas WHERE id = $1`, [MARIO_BRAGA_ID]);
  if (rows.length === 0) {
    console.log('Escola não encontrada.');
    await client.end();
    return;
  }

  for (const [campo, valor] of Object.entries(rows[0])) {
    if (typeof valor === 'string') {
      const temSubstituicao = valor.includes('\uFFFD');
      console.log(`${campo}: "${valor}" ${temSubstituicao ? '⚠ TEM U+FFFD' : ''}`);
      if (temSubstituicao) {
        console.log(`  codepoints: ${[...valor].map((c) => c.codePointAt(0).toString(16)).join(' ')}`);
      }
    }
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
