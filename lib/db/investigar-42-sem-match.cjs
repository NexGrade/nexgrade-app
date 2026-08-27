// investigar-42-sem-match.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os',
  'para', 'no', 'na', 'nos', 'nas', 'com', 'ao', 'aos', 'à', 'às',
]);

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenizar(nome) {
  const limpo = removerAcentos(nome.toLowerCase())
    .replace(/[.,\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.split(' ').filter(w => w.length > 1 && !STOPWORDS.has(w));
}

function tokenPrefixScore(tokensA, tokensB) {
  let casados = 0;
  for (const ta of tokensA) {
    if (tokensB.some(tb => tb.startsWith(ta) || ta.startsWith(tb))) casados++;
  }
  return casados / Math.max(tokensA.length, 1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const catalogoRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas_catalogo`);
    const catalogo = catalogoRes.rows.map(d => ({ ...d, tokens: tokenizar(d.nome) }));
    const catalogoPorNome = new Map(catalogo.map(d => [d.nome.trim().toLowerCase().replace(/\s+/g, ' '), d]));
    const catalogoPorCodigo = new Map(catalogo.filter(d => d.codigo_sae).map(d => [d.codigo_sae, d]));

    const mbRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1`,
      [MARIO_BRAGA_ORG_ID]
    );
    const semMatch = mbRes.rows.filter(d => {
      const key = d.nome.trim().toLowerCase().replace(/\s+/g, ' ');
      return !catalogoPorNome.has(key);
    });

    console.log(`Total sem correspondência por nome exato: ${semMatch.length}\n`);

    console.log('=== PARTE A: já têm codigo_sae — existe no catálogo? ===\n');
    const comCodigoValido = [];
    const comCodigoInvalido = [];
    for (const d of semMatch.filter(x => x.codigo_sae)) {
      const doCatalogo = catalogoPorCodigo.get(d.codigo_sae);
      if (doCatalogo) {
        console.log(`✅ id=${d.id} "${d.nome}" (SAE ${d.codigo_sae}) — código real, catálogo chama de "${doCatalogo.nome}"`);
        comCodigoValido.push({ ...d, nomeCatalogo: doCatalogo.nome });
      } else {
        console.log(`❓ id=${d.id} "${d.nome}" (SAE ${d.codigo_sae}) — código NÃO existe no catálogo`);
        comCodigoInvalido.push(d);
      }
    }

    console.log('\n\n=== PARTE B: sem codigo_sae — candidatos por similaridade ===\n');
    const semCodigo = semMatch.filter(x => !x.codigo_sae);
    const candidatosPorItem = [];
    for (const d of semCodigo) {
      const tokensD = tokenizar(d.nome);
      const candidatos = catalogo
        .map(c => ({ c, score: Math.max(
          tokenPrefixScore(tokensD, c.tokens),
          tokenPrefixScore(c.tokens, tokensD),
        ) }))
        .filter(x => x.score >= 0.6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      console.log(`\n"${d.nome}" (id=${d.id}):`);
      if (candidatos.length === 0) {
        console.log('  (nenhum candidato >= 0.6)');
      } else {
        for (const cand of candidatos) {
          console.log(`  score=${cand.score.toFixed(2)} -> id=${cand.c.id} "${cand.c.nome}" SAE=${cand.c.codigo_sae || '(vazio)'}`);
        }
      }
      candidatosPorItem.push({ mb: d, candidatos: candidatos.map(c => ({ id: c.c.id, nome: c.c.nome, codigo_sae: c.c.codigo_sae, score: c.score })) });
    }

    fs.writeFileSync(
      path.join(__dirname, 'investigacao-42-sem-match.json'),
      JSON.stringify({ comCodigoValido, comCodigoInvalido, candidatosPorItem }, null, 2)
    );
    console.log('\n\nSalvo em: investigacao-42-sem-match.json');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
