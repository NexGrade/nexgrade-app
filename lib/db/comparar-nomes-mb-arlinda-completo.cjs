// comparar-nomes-mb-arlinda-completo.cjs
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

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normalizarTotal(nome) {
  return removerAcentos(nome.trim().toLowerCase()).replace(/\s+/g, ' ');
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const mbRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]);
    const arlRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1`, [ARLINDA_ORG_ID]);
    console.log(`Mário Braga: ${mbRes.rows.length} disciplinas`);
    console.log(`Arlinda: ${arlRes.rows.length} disciplinas\n`);

    const arlPorCodigo = new Map(arlRes.rows.filter(d => d.codigo_sae).map(d => [d.codigo_sae, d]));
    const mbPorCodigo = new Map(mbRes.rows.filter(d => d.codigo_sae).map(d => [d.codigo_sae, d]));

    console.log('=== 1. Mesmo codigo_sae, nome DIFERENTE entre as escolas ===\n');
    const divergentesPorCodigo = [];
    for (const [codigo, mbItem] of mbPorCodigo) {
      const arlItem = arlPorCodigo.get(codigo);
      if (!arlItem) continue;
      if (normalizarTotal(mbItem.nome) !== normalizarTotal(arlItem.nome)) {
        divergentesPorCodigo.push({ codigo_sae: codigo, mario_braga: mbItem.nome, mb_id: mbItem.id, arlinda: arlItem.nome, arl_id: arlItem.id });
      }
    }
    console.log(`Total: ${divergentesPorCodigo.length}`);
    console.table(divergentesPorCodigo);

    console.log('\n\n=== 2. Mesmo nome (ignorando acento/case), mas grafia diferente ===\n');
    const arlPorNomeNorm = new Map(arlRes.rows.map(d => [normalizarTotal(d.nome), d]));
    const divergentesGrafia = [];
    for (const mbItem of mbRes.rows) {
      const key = normalizarTotal(mbItem.nome);
      const arlItem = arlPorNomeNorm.get(key);
      if (!arlItem) continue;
      if (mbItem.nome !== arlItem.nome) {
        divergentesGrafia.push({ mario_braga: mbItem.nome, mb_id: mbItem.id, arlinda: arlItem.nome, arl_id: arlItem.id });
      }
    }
    console.log(`Total: ${divergentesGrafia.length}`);
    console.table(divergentesGrafia);

    console.log('\n\n=== 3. Sem codigo_sae nos dois lados — nomes só parcialmente parecidos (revisão manual) ===\n');
    const mbSemCodigo = mbRes.rows.filter(d => !d.codigo_sae);
    const arlSemCodigo = arlRes.rows.filter(d => !d.codigo_sae);
    const candidatosManuais = [];
    for (const mbItem of mbSemCodigo) {
      const mbNorm = normalizarTotal(mbItem.nome);
      if (arlPorNomeNorm.has(mbNorm)) continue;
      const mbPalavras = new Set(mbNorm.split(' ').filter(w => w.length > 3));
      for (const arlItem of arlSemCodigo) {
        const arlNorm = normalizarTotal(arlItem.nome);
        const arlPalavras = new Set(arlNorm.split(' ').filter(w => w.length > 3));
        const comuns = [...mbPalavras].filter(w => arlPalavras.has(w)).length;
        const total = Math.max(mbPalavras.size, arlPalavras.size, 1);
        const score = comuns / total;
        if (score >= 0.6 && score < 1) {
          candidatosManuais.push({ mario_braga: mbItem.nome, mb_id: mbItem.id, arlinda: arlItem.nome, arl_id: arlItem.id, score: score.toFixed(2) });
        }
      }
    }
    console.log(`Total: ${candidatosManuais.length}`);
    console.table(candidatosManuais);

    fs.writeFileSync(
      path.join(__dirname, 'comparacao-nomes-mb-arlinda-completo.json'),
      JSON.stringify({ divergentesPorCodigo, divergentesGrafia, candidatosManuais }, null, 2)
    );
    console.log('\nSalvo em: comparacao-nomes-mb-arlinda-completo.json');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
