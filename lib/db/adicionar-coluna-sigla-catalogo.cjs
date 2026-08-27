/**
 * adicionar-coluna-sigla-catalogo.cjs
 *
 * Adiciona a coluna "sigla" (text, nullable) na tabela
 * disciplinas_catalogo -- ela nao existe hoje, so existe na tabela
 * disciplinas (por escola).
 *
 * ALTER TABLE ADD COLUMN com coluna nullable e uma operacao segura e
 * rapida em Postgres (nao reescreve a tabela inteira, nao trava por
 * muito tempo) -- ainda assim, roda em dry-run primeiro por padrao.
 *
 * Uso:
 *   node adicionar-coluna-sigla-catalogo.cjs            (dry-run, padrao)
 *   node adicionar-coluna-sigla-catalogo.cjs --aplicar   (aplica de fato)
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

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const log = console.log;

  try {
    const { rows: existente } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'disciplinas_catalogo' AND column_name = 'sigla'`
    );
    if (existente.length > 0) {
      log('[AVISO] Coluna "sigla" já existe em disciplinas_catalogo. Nada a fazer.');
      return;
    }

    log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}`);
    log('Comando: ALTER TABLE disciplinas_catalogo ADD COLUMN sigla text;');

    if (APLICAR) {
      await client.query('BEGIN');
      await client.query('ALTER TABLE disciplinas_catalogo ADD COLUMN sigla text');
      await client.query('COMMIT');
      log('✅ Coluna "sigla" adicionada com sucesso.');
    } else {
      log('↩️  DRY-RUN -- nada foi alterado. Rode com --aplicar pra aplicar de fato.');
    }
  } catch (err) {
    console.error('Erro:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();
