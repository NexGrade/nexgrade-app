// auditar-catalogo-acentos-e-codigos-suspeitos.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarTotal(nome) {
  return removerAcentos(nome.trim().toLowerCase()).replace(/\s+/g, ' ');
}

// [AMPLIADO] Lista maior de conectores/preposições/pronomes que, se forem
// a ÚLTIMA palavra do nome, quase sempre indicam frase cortada no meio.
const PALAVRAS_DE_CORTE = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os',
  'para', 'no', 'na', 'nos', 'nas', 'com', 'ao', 'aos', 'à', 'às', 'ou',
  'que', 'se', 'por', 'sem', 'sob', 'sobre', 'entre', 'até', 'desde',
  'num', 'numa', 'nesse', 'nessa', 'neste', 'nesta', 'pelo', 'pela',
  'seu', 'sua', 'seus', 'suas', 'este', 'esta', 'esse', 'essa',
  'como', 'quando', 'onde', 'mas', 'porém', 'porem', 'ate',
]);

function ultimaPalavraETerminacao(nome) {
  const semEspacoFinal = nome.trim();
  const terminaComVirgula = /,\s*$/.test(semEspacoFinal);
  const limpo = removerAcentos(semEspacoFinal.toLowerCase()).replace(/[.,]/g, '').trim();
  const partes = limpo.split(/\s+/);
  return { ultima: partes[partes.length - 1], terminaComVirgula };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const todasRes = await client.query(`SELECT id, nome, codigo_sae, categoria_curricular_padrao FROM disciplinas_catalogo ORDER BY nome`);
    console.log(`Total de disciplinas: ${todasRes.rows.length}\n`);

    console.log('=== 1. Duplicatas por nome (ignorando acento, maiúscula, espaço) ===\n');
    const porNomeSemAcento = new Map();
    for (const d of todasRes.rows) {
      const key = normalizarTotal(d.nome);
      if (!porNomeSemAcento.has(key)) porNomeSemAcento.set(key, []);
      porNomeSemAcento.get(key).push(d);
    }
    const dupSemAcento = [...porNomeSemAcento.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`Grupos duplicados: ${dupSemAcento.length}`);
    for (const [key, arr] of dupSemAcento) {
      console.log(`\n"${key}":`);
      for (const d of arr) {
        console.log(`  id=${d.id} nome="${d.nome}" codigo_sae=${d.codigo_sae || '(vazio)'} cat=${d.categoria_curricular_padrao || '(vazia)'}`);
      }
    }

    console.log('\n\n=== 2. codigo_sae com formato suspeito (possíveis códigos fictícios) ===\n');
    const suspeitos = todasRes.rows.filter(d => {
      if (!d.codigo_sae) return false;
      const cod = d.codigo_sae.trim();
      const soDigitos = /^\d+$/.test(cod);
      if (!soDigitos) return true;
      const numero = parseInt(cod, 10);
      const redondo = numero % 100 === 0 && numero >= 100 && numero <= 9900;
      return redondo;
    });
    console.log(`Códigos suspeitos encontrados: ${suspeitos.length}`);
    console.table(suspeitos);

    console.log('\n\n=== 3. Nomes incompletos (lista ampliada de conectores + termina em vírgula) ===\n');
    const incompletos = todasRes.rows.filter(d => {
      const { ultima, terminaComVirgula } = ultimaPalavraETerminacao(d.nome);
      return terminaComVirgula || PALAVRAS_DE_CORTE.has(ultima);
    });
    console.log(`Nomes incompletos encontrados: ${incompletos.length}`);
    console.table(incompletos);

    fs.writeFileSync(
      path.join(__dirname, 'auditoria-acentos-e-codigos-suspeitos.json'),
      JSON.stringify({ dupSemAcento, suspeitos, incompletos }, null, 2)
    );
    console.log('\nSalvo em: auditoria-acentos-e-codigos-suspeitos.json');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
