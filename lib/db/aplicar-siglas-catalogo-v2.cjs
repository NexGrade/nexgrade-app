/**
 * aplicar-siglas-catalogo-v2.cjs
 *
 * Mesma convencao base (2 palavras x 3 letras, ponto entre elas,
 * romano separado), mas com resolucao automatica de colisao em
 * camadas:
 *   1) 2 palavras x 3 letras (padrao)
 *   2) Se colidir: 3 palavras x 3 letras (so pro grupo que colidiu)
 *   3) Se ainda colidir: 4 letras por palavra (mesmo grupo)
 *   4) Se ainda colidir: fica sinalizado pra revisao manual (nao
 *      aplica nada nesse item ate decisao humana)
 *
 * Uso:
 *   node aplicar-siglas-catalogo-v2.cjs            (dry-run, padrao)
 *   node aplicar-siglas-catalogo-v2.cjs --aplicar   (aplica de fato)
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

const MANUAIS = {
  'Rec. Aprend. L. Port': 'REC.APR.POR',
  'Rec. Aprend. Matemática': 'REC.APR.MAT',
  'Soc.gov.cidad e Sociedade': 'SOC.CID',
  'Fil.textos Filosóficos': 'TEXFIL',
};

function extrairPartes(nomeOriginal) {
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
  return { significativas, romano };
}

function montarSigla(significativas, romano, numPalavras, letrasPorPalavra) {
  let base;
  if (significativas.length <= 1) {
    base = removerAcentos((significativas[0] ?? '')).toUpperCase().replace(/[^A-Z]/g, '').slice(0, Math.max(letrasPorPalavra, 3));
  } else {
    const partes = significativas.slice(0, numPalavras).map((p) =>
      removerAcentos(p).toUpperCase().replace(/[^A-Z]/g, '').slice(0, letrasPorPalavra)
    );
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
    log(`Total de disciplinas no catálogo: ${rows.length}\n`);

    const registros = rows.map((r) => {
      const { significativas, romano } = extrairPartes(r.nome);
      const siglaManual = MANUAIS[r.nome];
      return { id: r.id, nome: r.nome, significativas, romano, siglaManual };
    });

    // Camada 1: 2 palavras x 3 letras (ou manual, se aplicavel)
    for (const reg of registros) {
      reg.sigla = reg.siglaManual ?? montarSigla(reg.significativas, reg.romano, 2, 3);
      reg.nivel = reg.siglaManual ? 'manual' : 'L1 (2x3)';
    }

    function agruparPorSigla(lista) {
      const grupos = new Map();
      for (const r of lista) {
        if (!grupos.has(r.sigla)) grupos.set(r.sigla, []);
        grupos.get(r.sigla).push(r);
      }
      return grupos;
    }

    // Camada 2: escalar pra 3 palavras x 3 letras, so nos grupos que colidiram na camada 1
    let grupos = agruparPorSigla(registros.filter(r => !r.siglaManual));
    for (const [sigla, membros] of grupos.entries()) {
      if (membros.length <= 1) continue;
      for (const m of membros) {
        m.sigla = montarSigla(m.significativas, m.romano, 3, 3);
        m.nivel = 'L2 (3x3)';
      }
    }

    // Camada 3: escalar pra 4 letras por palavra (mantendo 3 palavras), so onde ainda colide
    grupos = agruparPorSigla(registros.filter(r => !r.siglaManual));
    for (const [sigla, membros] of grupos.entries()) {
      if (membros.length <= 1) continue;
      for (const m of membros) {
        m.sigla = montarSigla(m.significativas, m.romano, 3, 4);
        m.nivel = 'L3 (3x4)';
      }
    }

    // Camada 4: se AINDA colidir (nomes genuinamente muito parecidos,
    // ou identicos), adiciona um numero -2, -3... na ordem do id do
    // catalogo. Isso e so pra garantir sigla unica -- nao finge
    // diferenca semantica que nao existe (sigla nao e dado oficial
    // tipo codigo_sae, e so um atalho de exibicao).
    grupos = agruparPorSigla(registros.filter(r => !r.siglaManual));
    for (const [sigla, membros] of grupos.entries()) {
      if (membros.length <= 1) continue;
      const ordenados = [...membros].sort((a, b) => a.id - b.id);
      ordenados.forEach((m, idx) => {
        if (idx === 0) return; // primeiro mantem a sigla sem sufixo
        m.sigla = `${m.sigla}-${idx + 1}`;
        m.nivel = 'L4 (sufixo numerico)';
      });
    }

    // Verificacao final -- o que ainda colide vai pra revisao manual
    grupos = agruparPorSigla(registros);
    const paraRevisao = [];
    const prontos = [];
    for (const [sigla, membros] of grupos.entries()) {
      if (membros.length > 1) {
        for (const m of membros) paraRevisao.push(m);
      } else {
        prontos.push(membros[0]);
      }
    }

    log(`=== Resumo da resolução ===`);
    log(`Prontos (sem colisão): ${prontos.length}`);
    log(`  - via manual: ${prontos.filter(r => r.nivel === 'manual').length}`);
    log(`  - via L1 (2 palavras x 3 letras): ${prontos.filter(r => r.nivel === 'L1 (2x3)').length}`);
    log(`  - via L2 (3 palavras x 3 letras): ${prontos.filter(r => r.nivel === 'L2 (3x3)').length}`);
    log(`  - via L3 (3 palavras x 4 letras): ${prontos.filter(r => r.nivel === 'L3 (3x4)').length}`);
    log(`  - via L4 (sufixo numérico): ${prontos.filter(r => r.nivel === 'L4 (sufixo numerico)').length}`);
    log(`Ainda precisam de revisão manual: ${paraRevisao.length}\n`);

    if (paraRevisao.length > 0) {
      log(`=== Itens que precisam de revisão manual (${paraRevisao.length}) ===`);
      const gruposRevisao = agruparPorSigla(paraRevisao);
      for (const [sigla, membros] of gruposRevisao.entries()) {
        log(`  "${sigla}":`);
        for (const m of membros) log(`      id=${m.id}  "${m.nome}"`);
      }
      log('');
    }

    log(`=== Prontos para aplicar (${prontos.length}) ===`);
    for (const r of prontos) {
      log(`  id=${r.id}\t"${r.nome}"\t-> "${r.sigla}"\t[${r.nivel}]`);
    }

    if (APLICAR) {
      await client.query('BEGIN');
      let atualizadas = 0;
      for (const r of prontos) {
        await client.query('UPDATE disciplinas_catalogo SET sigla = $1 WHERE id = $2', [r.sigla, r.id]);
        atualizadas++;
      }
      await client.query('COMMIT');
      log(`\n✅ COMMIT realizado. ${atualizadas} disciplinas atualizadas (as ${paraRevisao.length} pendentes de revisão manual ficaram sem sigla, sem erro).`);
    } else {
      log(`\n↩️  DRY-RUN -- nada foi alterado. Rode com --aplicar pra aplicar os ${prontos.length} itens sem colisão.`);
    }

  } catch (err) {
    console.error('Erro:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, `aplicar-siglas-catalogo-v2-relatorio-${Date.now()}.txt`), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
