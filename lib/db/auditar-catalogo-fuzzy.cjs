// auditar-catalogo-fuzzy.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

// Palavras muito comuns que não ajudam a identificar a disciplina
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os',
  'para', 'no', 'na', 'nos', 'nas', 'com', 'ao', 'aos', 'à', 'às',
  'i', 'ii', 'iii', 'iv', 'v',
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

function jaccard(setA, setB) {
  const inter = [...setA].filter(x => setB.has(x)).length;
  const uni = new Set([...setA, ...setB]).size;
  return uni === 0 ? 0 : inter / uni;
}

// Também detecta "prefixo abreviado": se todo token de A é prefixo de
// algum token de B (ex.: "rec" -> "recomposicao", "aprend" -> "aprendizagem")
function tokenPrefixMatch(tokensA, tokensB) {
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
    const res = await client.query(`SELECT id, nome, codigo_sae, categoria_curricular_padrao FROM disciplinas_catalogo ORDER BY nome`);
    const todas = res.rows.map(d => ({ ...d, tokens: tokenizar(d.nome) }));
    console.log(`Total de disciplinas: ${todas.length}`);

    // 1. Recheck: codigo_sae duplicado (deveria ser 0 apos o merge anterior)
    const porCodigo = new Map();
    for (const d of todas) {
      if (!d.codigo_sae) continue;
      if (!porCodigo.has(d.codigo_sae)) porCodigo.set(d.codigo_sae, []);
      porCodigo.get(d.codigo_sae).push(d);
    }
    const dupCodigoSae = [...porCodigo.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`\n=== 1. codigo_sae duplicado (recheck pos-merge): ${dupCodigoSae.length} ===`);

    // 2. Bucket por primeira letra do primeiro token, pra reduzir comparacoes
    const buckets = new Map();
    for (const d of todas) {
      if (d.tokens.length === 0) continue;
      const chave = d.tokens[0][0]; // primeira letra da primeira palavra significativa
      if (!buckets.has(chave)) buckets.set(chave, []);
      buckets.get(chave).push(d);
    }

    const candidatos = [];
    for (const [_, grupo] of buckets) {
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          const a = grupo[i], b = grupo[j];
          if (a.id === b.id) continue;
          const setA = new Set(a.tokens), setB = new Set(b.tokens);
          const jac = jaccard(setA, setB);
          const prefA = tokenPrefixMatch(a.tokens, b.tokens);
          const prefB = tokenPrefixMatch(b.tokens, a.tokens);
          const score = Math.max(jac, (prefA + prefB) / 2);
          if (score >= 0.5) {
            candidatos.push({ a, b, score, jac, prefScore: (prefA + prefB) / 2 });
          }
        }
      }
    }
    candidatos.sort((x, y) => y.score - x.score);

    console.log(`\n=== 2. Candidatos a duplicata por similaridade de palavras: ${candidatos.length} ===`);
    for (const c of candidatos) {
      console.log(`\nscore=${c.score.toFixed(2)} (jaccard=${c.jac.toFixed(2)}, prefixo=${c.prefScore.toFixed(2)})`);
      console.log(`  id=${c.a.id} "${c.a.nome}" codigo_sae=${c.a.codigo_sae || '(vazio)'} cat=${c.a.categoria_curricular_padrao || '(vazia)'}`);
      console.log(`  id=${c.b.id} "${c.b.nome}" codigo_sae=${c.b.codigo_sae || '(vazio)'} cat=${c.b.categoria_curricular_padrao || '(vazia)'}`);
    }

    fs.writeFileSync(
      path.join(__dirname, 'auditoria-catalogo-fuzzy.json'),
      JSON.stringify({ dupCodigoSae, candidatos }, null, 2)
    );
    console.log(`\nSalvo em: auditoria-catalogo-fuzzy.json`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
