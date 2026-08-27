// conferir-estrategia-marketing.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const ARLINDA_ORG_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('=== 1. Estado atual: disciplinas com "Estratégi" no nome (Mário Braga) ===');
    const mbRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%estratégi%'`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(mbRes.rows);

    console.log('\nVínculos em turma_disciplinas para essas disciplinas:');
    if (mbRes.rows.length > 0) {
      const tdRes = await client.query(
        `SELECT td.disciplina_id, t.nome AS turma_nome
         FROM turma_disciplinas td
         JOIN turmas t ON t.id = td.turma_id
         WHERE td.disciplina_id = ANY($1)`,
        [mbRes.rows.map(r => r.id)]
      );
      console.table(tdRes.rows);
    }

    console.log('\n\n=== 2. Arlinda: disciplinas com "Estratégi" no nome ===');
    const arlEstrategRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%estratégi%'`,
      [ARLINDA_ORG_ID]
    );
    console.table(arlEstrategRes.rows);

    console.log('\n=== 3. Arlinda: varredura geral por singular/plural duplicado (mesmo codigo_sae, nomes diferentes) ===');
    const arlTodasRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 AND codigo_sae IS NOT NULL`,
      [ARLINDA_ORG_ID]
    );
    const porCodigo = new Map();
    for (const d of arlTodasRes.rows) {
      if (!porCodigo.has(d.codigo_sae)) porCodigo.set(d.codigo_sae, []);
      porCodigo.get(d.codigo_sae).push(d);
    }
    const duplicados = [...porCodigo.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`codigo_sae duplicados na Arlinda: ${duplicados.length}`);
    for (const [codigo, arr] of duplicados) {
      console.log(`  codigo_sae ${codigo}:`);
      for (const d of arr) console.log(`    id=${d.id} "${d.nome}"`);
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
