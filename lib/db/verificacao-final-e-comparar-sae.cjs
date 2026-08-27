// verificacao-final-e-comparar-sae.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

const PALAVRAS_DE_CORTE = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os',
  'para', 'no', 'na', 'nos', 'nas', 'com', 'ao', 'aos', 'à', 'às', 'ou',
]);

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function ultimaPalavra(nome) {
  const limpo = removerAcentos(nome.toLowerCase()).replace(/[.,]/g, '').trim();
  const partes = limpo.split(/\s+/);
  return partes[partes.length - 1];
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('=== PARTE 1: Verificação final do catálogo mestre ===\n');

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`Total de disciplinas: ${totalRes.rows[0].count} (esperado: 734)`);

    const todasRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas_catalogo ORDER BY nome`);

    const porNomeNorm = new Map();
    for (const d of todasRes.rows) {
      const key = d.nome.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!porNomeNorm.has(key)) porNomeNorm.set(key, []);
      porNomeNorm.get(key).push(d);
    }
    const dupNome = [...porNomeNorm.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`Duplicatas de nome exato restantes: ${dupNome.length}`);
    if (dupNome.length > 0) console.table(dupNome.map(([k, arr]) => ({ nome: k, ids: arr.map(d => d.id).join(',') })));

    const porCodigo = new Map();
    for (const d of todasRes.rows) {
      if (!d.codigo_sae) continue;
      if (!porCodigo.has(d.codigo_sae)) porCodigo.set(d.codigo_sae, []);
      porCodigo.get(d.codigo_sae).push(d);
    }
    const dupCodigo = [...porCodigo.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`codigo_sae duplicado restante: ${dupCodigo.length}`);
    if (dupCodigo.length > 0) console.table(dupCodigo.map(([k, arr]) => ({ codigo_sae: k, nomes: arr.map(d => `${d.id}:${d.nome}`).join(' | ') })));

    const truncadas = todasRes.rows.filter(d => PALAVRAS_DE_CORTE.has(ultimaPalavra(d.nome)));
    console.log(`Entradas truncadas restantes: ${truncadas.length}`);
    if (truncadas.length > 0) console.table(truncadas);

    console.log('\n\n=== PARTE 2: codigo_sae do Mário Braga vs catálogo mestre ===\n');

    const mbRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Total de disciplinas do Mário Braga: ${mbRes.rows.length}`);

    const catalogoPorNome = new Map();
    for (const d of todasRes.rows) {
      const key = d.nome.trim().toLowerCase().replace(/\s+/g, ' ');
      catalogoPorNome.set(key, d);
    }

    const semMatch = [];
    const comDivergencia = [];
    const ok = [];

    for (const d of mbRes.rows) {
      const key = d.nome.trim().toLowerCase().replace(/\s+/g, ' ');
      const doCatalogo = catalogoPorNome.get(key);
      if (!doCatalogo) {
        semMatch.push(d);
        continue;
      }
      if (doCatalogo.codigo_sae !== d.codigo_sae) {
        comDivergencia.push({
          id: d.id, nome: d.nome,
          sae_mario_braga: d.codigo_sae, sae_catalogo: doCatalogo.codigo_sae,
          catalogo_id: doCatalogo.id,
        });
      } else {
        ok.push(d);
      }
    }

    console.log(`\nBatendo certinho: ${ok.length}`);
    console.log(`Divergência de codigo_sae: ${comDivergencia.length}`);
    console.table(comDivergencia);
    console.log(`\nSem correspondência no catálogo (nome não encontrado): ${semMatch.length}`);
    console.table(semMatch);

    fs.writeFileSync(
      path.join(__dirname, 'comparacao-sae-mario-braga.json'),
      JSON.stringify({ ok: ok.length, comDivergencia, semMatch }, null, 2)
    );
    console.log('\nSalvo em: comparacao-sae-mario-braga.json');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
