/**
 * auditar-capitalizacao-e-duplicatas-catalogo.cjs
 *
 * Script SOMENTE LEITURA — não altera nada no banco.
 *
 * Parte A: Capitalização inconsistente.
 *   Compara cada nome com uma versão "Título Case" (regras de português:
 *   preposições/artigos/conjunções minúsculos, exceto na primeira palavra).
 *   Entradas com palavras TODO-MAIÚSCULAS de 2-4 letras (ex: "IF", "TI",
 *   "EAD") são marcadas separadamente como "possível acrônimo" e NÃO
 *   recebem sugestão automática — precisam de revisão manual.
 *
 * Parte B: Quase-duplicatas.
 *   Normaliza nome (sem acento, minúsculo, remove sufixo romano/arábico
 *   final, espaços colapsados) e agrupa. Grupos com mais de 1 id distinto
 *   indicam possível duplicata / inconsistência a resolver.
 *
 * Uso:
 *   node lib\db\auditar-capitalizacao-e-duplicatas-catalogo.cjs
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const PALAVRAS_MINUSCULAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'a', 'o', 'as', 'os', 'ou', 'com', 'para', 'por', 'um', 'uma',
  'ao', 'aos', 'à', 'às', 'sem', 'sob', 'entre',
]);

function removerAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tituloCase(nome) {
  const palavras = nome.split(' ');
  return palavras
    .map((p, i) => {
      const pLimpa = p.toLowerCase();
      const semAcentoLimpa = removerAcentos(pLimpa);
      if (i > 0 && PALAVRAS_MINUSCULAS.has(semAcentoLimpa)) {
        return pLimpa;
      }
      if (p.length === 0) return p;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join(' ');
}

function pareceAcronimo(nome) {
  return nome.split(' ').some((p) => p.length >= 2 && p.length <= 4 && p === p.toUpperCase() && /[A-Z]/.test(p) && !/[0-9]/.test(p));
}

function normalizarBase(nome) {
  let s = removerAcentos(nome.toLowerCase()).trim();
  s = s.replace(/\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i, '');
  s = s.replace(/\s+\d+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  try {
    const { rows } = await client.query(
      'SELECT id, nome, codigo_sae FROM disciplinas_catalogo ORDER BY nome'
    );

    console.log(`Total de disciplinas no catálogo: ${rows.length}\n`);

    // === PARTE A: Capitalização ===
    console.log('========== PARTE A: CAPITALIZAÇÃO ==========\n');
    const semAcronimo = [];
    const comAcronimo = [];

    for (const r of rows) {
      const sugestao = tituloCase(r.nome);
      if (sugestao !== r.nome) {
        if (pareceAcronimo(r.nome)) {
          comAcronimo.push({ ...r, sugestao });
        } else {
          semAcronimo.push({ ...r, sugestao });
        }
      }
    }

    console.log(`--- A1. Correções seguras (sem acrônimo aparente): ${semAcronimo.length} ---`);
    for (const r of semAcronimo) {
      console.log(`id=${r.id}\t"${r.nome}"\t-> "${r.sugestao}"`);
    }

    console.log(`\n--- A2. Precisam revisão manual (possível acrônimo, ex: IF/TI/EAD): ${comAcronimo.length} ---`);
    for (const r of comAcronimo) {
      console.log(`id=${r.id}\t"${r.nome}"\t-> sugestão ingênua: "${r.sugestao}" (NÃO aplicar sem revisar)`);
    }

    // === PARTE B: Quase-duplicatas ===
    console.log('\n\n========== PARTE B: QUASE-DUPLICATAS (mesmo nome-base, formas diferentes) ==========\n');
    const grupos = new Map();
    for (const r of rows) {
      const base = normalizarBase(r.nome);
      if (!grupos.has(base)) grupos.set(base, []);
      grupos.get(base).push(r);
    }

    const suspeitos = [...grupos.entries()].filter(([, itens]) => itens.length > 1);
    console.log(`Grupos com mais de 1 entrada para o mesmo nome-base: ${suspeitos.length}\n`);

    for (const [base, itens] of suspeitos) {
      console.log(`Base: "${base}"`);
      for (const it of itens) {
        console.log(`   id=${it.id}\tnome="${it.nome}"\tcodigo_sae=${it.codigo_sae ?? 'null'}`);
      }
      console.log('');
    }

  } finally {
    await client.end();
  }
}

main();
