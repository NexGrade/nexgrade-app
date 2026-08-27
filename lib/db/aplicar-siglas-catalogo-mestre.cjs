/**
 * aplicar-siglas-catalogo-mestre.cjs
 *
 * Aplica a mesma convencao de sigla ja validada no Mario Braga (3
 * letras por palavra significativa, ate 2 partes, separadas por
 * ponto; sufixo romano mantido separado com espaco) nas 733
 * disciplinas do catalogo mestre (disciplinas_catalogo).
 *
 * Calcula direto do nome atual no banco -- nao depende de lista fixa
 * colada, elimina risco de transcricao.
 *
 * Uso:
 *   node aplicar-siglas-catalogo-mestre.cjs            (dry-run, padrao)
 *   node aplicar-siglas-catalogo-mestre.cjs --aplicar   (aplica de fato)
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

const APLICAR = process.argv.includes('--aplicar');

const CONECTORES = new Set(['de','da','do','das','dos','e','em','no','na','nos','nas','a','o','as','os','com','para','por','ao','aos','à','às']);
const ROMANOS = new Set(['I','II','III','IV','V','VI','VII','VIII','IX','X']);

function removerAcentos(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// Mesmas 4 excecoes manuais confirmadas no Mario Braga -- se o mesmo
// nome exato aparecer no catalogo mestre, usa a mesma sigla (mantem
// consistencia entre as duas fontes).
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
    .map((p) => p.replace(/[.,]/g, ''))
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

  log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);

  try {
    const { rows } = await client.query(`SELECT id, nome FROM disciplinas_catalogo ORDER BY nome`);
    const itens = rows.map((r) => ({ id: r.id, nome: r.nome, sigla: gerarSigla(r.nome) }));
    log(`Total de disciplinas no catálogo: ${itens.length}`);

    const contagem = new Map();
    for (const it of itens) contagem.set(it.sigla, (contagem.get(it.sigla) ?? 0) + 1);
    const colisoes = [...contagem.entries()].filter(([, c]) => c > 1);

    log(`\n=== Colisões: ${colisoes.length} ===`);
    for (const [sigla, c] of colisoes) {
      log(`  "${sigla}" (${c}x):`);
      for (const it of itens.filter((i) => i.sigla === sigla)) {
        log(`      id=${it.id}  "${it.nome}"`);
      }
    }

    if (colisoes.length > 0) {
      log(`\n[ABORTADO] Corrija as colisões antes de aplicar (edite o objeto MANUAIS no topo do script pros nomes problemáticos).`);
      return;
    }

    log(`\nNenhuma colisão -- ${itens.length} siglas únicas.\n`);

    await client.query('BEGIN');
    let atualizadas = 0;
    for (const it of itens) {
      await client.query('UPDATE disciplinas_catalogo SET sigla = $1 WHERE id = $2', [it.sigla, it.id]);
      log(`id=${it.id}: "${it.nome}" -> sigla "${it.sigla}"`);
      atualizadas++;
    }
    log(`\nResumo: ${atualizadas} atualizadas.`);

    if (APLICAR) {
      await client.query('COMMIT');
      log('\n✅ COMMIT realizado.');
    } else {
      await client.query('ROLLBACK');
      log('\n↩️  ROLLBACK (dry-run). Rode com --aplicar para aplicar de fato.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — ROLLBACK.', err);
    process.exitCode = 1;
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, `aplicar-siglas-catalogo-relatorio-${Date.now()}.txt`), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
