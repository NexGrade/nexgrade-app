// auditar-catalogo-completo.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

function normalizar(nome) {
  return (nome || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' '); // colapsa espaços múltiplos
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const todasRes = await client.query(`SELECT id, nome, codigo_sae, categoria_curricular_padrao FROM disciplinas_catalogo ORDER BY nome`);
    console.log(`Total de disciplinas no catálogo: ${todasRes.rows.length}`);

    // --- 1. Duplicatas por nome normalizado (case/espaço-insensitive) ---
    const porNomeNorm = new Map();
    for (const d of todasRes.rows) {
      const key = normalizar(d.nome);
      if (!porNomeNorm.has(key)) porNomeNorm.set(key, []);
      porNomeNorm.get(key).push(d);
    }
    const duplicadasPorNome = [...porNomeNorm.entries()].filter(([_, arr]) => arr.length > 1);

    console.log(`\n=== 1. Duplicatas por nome normalizado (case/espaço-insensitive): ${duplicadasPorNome.length} grupos ===`);
    for (const [key, arr] of duplicadasPorNome) {
      console.log(`\n"${key}":`);
      for (const d of arr) {
        console.log(`  id=${d.id} nome="${d.nome}" codigo_sae=${d.codigo_sae || '(vazio)'} categoria=${d.categoria_curricular_padrao || '(vazia)'}`);
      }
    }

    // --- 2. Heurística simples de singular/plural: nome X vs nome X + "s" (normalizado) ---
    console.log(`\n\n=== 2. Possíveis pares singular/plural (heurística: nome vs nome+"s") ===`);
    const nomesSet = new Set(porNomeNorm.keys());
    const paresPlural = [];
    for (const nome of nomesSet) {
      if (nomesSet.has(nome + 's') && nome.length > 3) {
        paresPlural.push([nome, nome + 's']);
      }
    }
    console.log(`Pares encontrados: ${paresPlural.length}`);
    for (const [sing, plur] of paresPlural) {
      const idsSing = porNomeNorm.get(sing).map(d => d.id).join(',');
      const idsPlur = porNomeNorm.get(plur).map(d => d.id).join(',');
      console.log(`  "${sing}" (id ${idsSing})  <->  "${plur}" (id ${idsPlur})`);
    }

    // Salvar tudo para consulta posterior
    const outPath = path.join(__dirname, 'auditoria-catalogo-completo.json');
    fs.writeFileSync(outPath, JSON.stringify({
      totalLinhas: todasRes.rows.length,
      duplicadasPorNome,
      possiveisSingularPlural: paresPlural,
    }, null, 2));
    console.log(`\nSalvo em: ${outPath}`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
