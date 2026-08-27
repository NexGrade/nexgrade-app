/**
 * gerar-sugestao-siglas.cjs
 * Script SOMENTE LEITURA -- gera sugestoes de sigla, nao grava nada.
 *
 * Convencao proposta:
 *   - Nome de 1 palavra significativa -> 3 primeiras letras
 *   - Nome de 2+ palavras -> iniciais das palavras significativas
 *     (ignora conectores: de/da/do/e/em/no/na/com/para/por/a/o etc.),
 *     ate 4 letras
 *   - Numeral romano no final (I, II, III...) -> mantido separado,
 *     com espaco, apos a sigla base
 *
 * Uso:
 *   node gerar-sugestao-siglas.cjs --escola=org_3HCMsuYeAwkggR1dxXNzEdzNaX8
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return { escolaId: args.escola ?? 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8' };
}

const CONECTORES = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'a', 'o', 'as', 'os', 'com', 'para', 'por', 'ao', 'aos', 'à', 'às',
]);
const ROMANOS = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

function removerAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function gerarSigla(nomeOriginal) {
  const palavras = nomeOriginal.split(' ').filter((p) => p.length > 0);
  let romano = null;
  let palavrasBase = palavras;
  const ultima = palavras[palavras.length - 1];
  if (ROMANOS.has(ultima)) {
    romano = ultima;
    palavrasBase = palavras.slice(0, -1);
  }
  const significativas = palavrasBase.filter((p) => {
    const norm = removerAcentos(p.toLowerCase()).replace(/[^a-z]/g, '');
    return norm.length > 0 && !CONECTORES.has(norm);
  });
  let base;
  if (significativas.length === 0) {
    base = removerAcentos(palavrasBase.join('')).toUpperCase().slice(0, 4);
  } else if (significativas.length === 1) {
    base = removerAcentos(significativas[0]).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  } else {
    base = significativas.map((p) => removerAcentos(p)[0]?.toUpperCase() ?? '').join('').slice(0, 4);
  }
  return romano ? `${base} ${romano}` : base;
}

async function main() {
  const { escolaId } = parseArgs();
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  try {
    const { rows } = await client.query(
      `SELECT id, nome, sigla FROM disciplinas WHERE escola_id = $1 ORDER BY nome`,
      [escolaId]
    );
    log(`Total de disciplinas: ${rows.length}\n`);

    const siglaCount = new Map();
    const sugestoes = [];
    for (const r of rows) {
      const sugestao = gerarSigla(r.nome);
      sugestoes.push({ id: r.id, nome: r.nome, siglaAtual: r.sigla, sugestao });
      siglaCount.set(sugestao, (siglaCount.get(sugestao) ?? 0) + 1);
    }

    log('=== Amostra de sugestões (todas as 95) ===');
    for (const s of sugestoes) {
      log(`  id=${s.id}\t"${s.nome}"\t-> "${s.sugestao}"${s.siglaAtual ? `  (JA TEM: "${s.siglaAtual}")` : ''}`);
    }

    const colisoes = [...siglaCount.entries()].filter(([, count]) => count > 1);
    log(`\n=== Colisões (mesma sigla sugerida pra disciplinas diferentes) ===`);
    log(`Total: ${colisoes.length}`);
    for (const [sigla, count] of colisoes) {
      const nomes = sugestoes.filter((s) => s.sugestao === sigla).map((s) => s.nome);
      log(`  "${sigla}" (${count}x): ${nomes.join(' | ')}`);
    }

  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, `sugestao-siglas-relatorio-${Date.now()}.txt`), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
