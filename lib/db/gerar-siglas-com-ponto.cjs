/**
 * gerar-siglas-com-ponto.cjs
 * Gera a lista final de siglas (3 letras por palavra significativa,
 * separadas por ponto, maximo 2 partes; sufixo romano mantido
 * separado) pra confirmar antes de montar o script de aplicacao.
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

const CONECTORES = new Set(['de','da','do','das','dos','e','em','no','na','nos','nas','a','o','as','os','com','para','por','ao','aos','à','às']);
const ROMANOS = new Set(['I','II','III','IV','V','VI','VII','VIII','IX','X']);

function removerAcentos(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// Excecoes manuais confirmadas
const MANUAIS = {
  'Rec. Aprend. L. Port': 'REC.APR.POR',
  'Rec. Aprend. Matemática': 'REC.APR.MAT',
  'Soc.gov.cidad e Sociedade': 'SOC.CID',
  'Fil.textos Filosóficos': 'TEXFIL',
};

function gerarSigla(nomeOriginal) {
  if (MANUAIS[nomeOriginal]) return MANUAIS[nomeOriginal];

  const palavras = nomeOriginal.split(' ').filter((p) => p.length > 0);
  let romano = null;
  let palavrasBase = palavras;
  const ultima = palavras[palavras.length - 1];
  if (ROMANOS.has(ultima)) { romano = ultima; palavrasBase = palavras.slice(0, -1); }

  const significativas = palavrasBase
    .map((p) => p.replace(/[.,]/g, '')) // tira pontuacao tipo "Adm." "Cont."
    .filter((p) => {
      const norm = removerAcentos(p.toLowerCase());
      return norm.length > 0 && !CONECTORES.has(norm);
    });

  let base;
  if (significativas.length <= 1) {
    base = removerAcentos((significativas[0] ?? palavrasBase.join(''))).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  } else {
    const partes = significativas.slice(0, 2).map((p) => removerAcentos(p).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3));
    base = partes.join('.');
  }
  return romano ? `${base} ${romano}` : base;
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  try {
    const { rows } = await client.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 ORDER BY nome`,
      ['org_3HCMsuYeAwkggR1dxXNzEdzNaX8']
    );
    const resultado = rows.map((r) => ({ id: r.id, nome: r.nome, sigla: gerarSigla(r.nome) }));

    log(`Total: ${resultado.length}\n`);
    for (const r of resultado) log(`  { id: ${r.id}, atual: ${JSON.stringify(r.nome)}, sigla: ${JSON.stringify(r.sigla)} },`);

    const contagem = new Map();
    for (const r of resultado) contagem.set(r.sigla, (contagem.get(r.sigla) ?? 0) + 1);
    const colisoes = [...contagem.entries()].filter(([, c]) => c > 1);
    log(`\nColisões: ${colisoes.length}`);
    for (const [sigla, c] of colisoes) {
      log(`  "${sigla}" (${c}x): ${resultado.filter(r => r.sigla === sigla).map(r => r.nome).join(' | ')}`);
    }
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, 'siglas-com-ponto-array.txt'), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
