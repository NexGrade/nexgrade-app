// investigar-truncadas-e-trio.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

// Palavras que, se forem a ÚLTIMA palavra do nome, indicam frase cortada
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
    console.log('=== 1. Trio "Rec. Aprend. L. Port" (ids 555, 336, 337) ===');
    const trioRes = await client.query(
      `SELECT id, nome, codigo_sae, categoria_curricular_padrao, created_at FROM disciplinas_catalogo WHERE id IN (555, 336, 337) ORDER BY id`
    );
    console.table(trioRes.rows);

    console.log('\n=== 2. Entradas com nome truncado (terminam em preposição/conjunção) ===');
    const todasRes = await client.query(`SELECT id, nome, codigo_sae, categoria_curricular_padrao, created_at FROM disciplinas_catalogo ORDER BY nome`);
    const truncadas = todasRes.rows.filter(d => PALAVRAS_DE_CORTE.has(ultimaPalavra(d.nome)));
    console.log(`Total de entradas truncadas encontradas: ${truncadas.length}`);
    console.table(truncadas);

    fs.writeFileSync(
      path.join(__dirname, 'entradas-truncadas-catalogo.json'),
      JSON.stringify({ trio: trioRes.rows, truncadas }, null, 2)
    );
    console.log('\nSalvo em: entradas-truncadas-catalogo.json');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
