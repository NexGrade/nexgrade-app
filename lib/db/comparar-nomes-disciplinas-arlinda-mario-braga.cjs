// comparar-nomes-disciplinas-arlinda-mario-braga.cjs
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

async function pegarNomesPorSerie(client, escolaId, serieAno) {
  const res = await client.query(`
    SELECT DISTINCT d.nome
    FROM matrizes_curriculares mc
    JOIN itens_matriz im ON im.matriz_curricular_id = mc.id
    JOIN disciplinas d ON d.id = im.disciplina_id
    WHERE mc.escola_id = $1 AND mc.serie_ano = $2
    ORDER BY d.nome
  `, [escolaId, serieAno]);
  return res.rows.map(r => r.nome);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const serie of ['6º Ano', '7º Ano', '8º Ano', '9º Ano']) {
      const mb = await pegarNomesPorSerie(client, MARIO_BRAGA_ORG_ID, serie);
      const arl = await pegarNomesPorSerie(client, ARLINDA_ORG_ID, serie);

      console.log(`\n=== ${serie} ===`);
      console.log(`Mário Braga (${mb.length}): ${mb.join(', ')}`);
      console.log(`Arlinda (${arl.length}): ${arl.join(', ')}`);

      const soMB = mb.filter(n => !arl.includes(n));
      const soArlinda = arl.filter(n => !mb.includes(n));
      const comuns = mb.filter(n => arl.includes(n));

      console.log(`Nomes idênticos em ambas: ${comuns.length} -> [${comuns.join(', ')}]`);
      if (soMB.length) console.log(`Só no Mário Braga: [${soMB.join(', ')}]`);
      if (soArlinda.length) console.log(`Só na Arlinda: [${soArlinda.join(', ')}]`);
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
