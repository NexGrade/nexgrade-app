/**
 * corrigir-administracao-if.cjs
 *
 * Corrige "Administração nos If" -> "Administração nos IF" no catálogo
 * mestre. "IF" é sigla oficial SEED-PR para "Itinerário Formativo"
 * (confirmado via documentação oficial da Secretaria de Estado da
 * Educação e do Esporte do Paraná - estrutura do Novo Ensino Médio).
 *
 * Uso:
 *   node lib\db\corrigir-administracao-if.cjs            (dry-run, padrão)
 *   node lib\db\corrigir-administracao-if.cjs --aplicar   (aplica de fato)
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
const ID = 6;
const ATUAL = 'Administração nos If';
const NOVO = 'Administração nos IF';

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);

  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, nome FROM disciplinas_catalogo WHERE id = $1', [ID]);

    if (rows.length === 0) {
      log(`[AVISO] id=${ID} não encontrado.`);
    } else if (rows[0].nome !== ATUAL) {
      log(`[DIVERGÊNCIA] esperado "${ATUAL}", encontrado "${rows[0].nome}" — pulando por segurança.`);
    } else {
      await client.query('UPDATE disciplinas_catalogo SET nome = $1 WHERE id = $2', [NOVO, ID]);
      log(`id=${ID}: "${ATUAL}" -> "${NOVO}"`);
    }

    if (APLICAR) {
      await client.query('COMMIT');
      log('\n✅ COMMIT realizado — alterações aplicadas.');
    } else {
      await client.query('ROLLBACK');
      log('\n↩️  ROLLBACK (dry-run) — nenhuma alteração persistida. Rode com --aplicar para aplicar de fato.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — ROLLBACK executado.', err);
    process.exitCode = 1;
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, 'corrigir-administracao-if-relatorio.txt'), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main();
