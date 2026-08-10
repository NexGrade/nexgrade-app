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

  const { rows } = await client.query(
    `SELECT id, nome FROM professores WHERE escola_id = $1 AND (nome ILIKE '%lincon%' OR nome ILIKE '%michelle%' OR nome ILIKE '%lucimeire%' OR nome ILIKE '%joao m%' OR nome ILIKE '%lucas%' OR nome ILIKE '%adalgisa%') ORDER BY nome`,
    [ESCOLA_ID]
  );
  for (const r of rows) console.log(`  id=${r.id} | "${r.nome}"`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
