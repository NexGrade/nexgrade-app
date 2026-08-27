/**
 * corrigir-machine-deep-learning.cjs
 *
 * Corrige capitalização de 2 disciplinas do catálogo mestre que a
 * heurística automática pulou (para não estragar "Machine"/"Deep"
 * dentro dos parênteses).
 *
 * Uso:
 *   node lib\db\corrigir-machine-deep-learning.cjs            (dry-run, padrão)
 *   node lib\db\corrigir-machine-deep-learning.cjs --aplicar   (aplica de fato)
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

const APLICAR = process.argv.includes('--aplicar');

const CONVERSOES = [
  { id: 862, atual: 'Aprendizado de máquina (Machine Learning)', novo: 'Aprendizado de Máquina (Machine Learning)' },
  { id: 565, atual: 'Redes neurais e aprendizado profundo (Deep Learning)', novo: 'Redes Neurais e Aprendizado Profundo (Deep Learning)' },
];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);

  try {
    await client.query('BEGIN');
    let atualizadas = 0, divergencias = 0;

    for (const item of CONVERSOES) {
      const { rows } = await client.query('SELECT id, nome FROM disciplinas_catalogo WHERE id = $1', [item.id]);
      if (rows.length === 0) {
        log(`[AVISO] id=${item.id} não encontrado.`);
        divergencias++;
        continue;
      }
      if (rows[0].nome !== item.atual) {
        log(`[DIVERGÊNCIA] id=${item.id}: esperado "${item.atual}", encontrado "${rows[0].nome}" — pulando.`);
        divergencias++;
        continue;
      }
      await client.query('UPDATE disciplinas_catalogo SET nome = $1 WHERE id = $2', [item.novo, item.id]);
      log(`id=${item.id}: "${item.atual}" -> "${item.novo}"`);
      atualizadas++;
    }

    log(`\nResumo: ${atualizadas} atualizadas, ${divergencias} puladas.`);

    if (APLICAR) {
      await client.query('COMMIT');
      log('\n✅ COMMIT realizado.');
    } else {
      await client.query('ROLLBACK');
      log('\n↩️  ROLLBACK (dry-run).');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — ROLLBACK.', err);
    process.exitCode = 1;
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, 'corrigir-machine-deep-learning-relatorio.txt'), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main();
