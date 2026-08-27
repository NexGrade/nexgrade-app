/**
 * converter-arabico-romano-catalogo.cjs
 *
 * Converte as 2 disciplinas do catálogo mestre (disciplinas_catalogo)
 * que ainda usam sufixo arábico, para o padrão romano.
 * Também padroniza a capitalização entre as duas ("com" minúsculo).
 *
 * IDs identificados pela auditoria (auditar-numeral-catalogo.cjs), sem colisão.
 *
 * Uso:
 *   node lib\db\converter-arabico-romano-catalogo.cjs            (dry-run, padrão)
 *   node lib\db\converter-arabico-romano-catalogo.cjs --aplicar   (aplica de fato)
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
  { id: 501, atual: 'Programação Com Python 1', novo: 'Programação com Python I' },
  { id: 861, atual: 'Programação com Python 2', novo: 'Programação com Python II' },
];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  console.log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);
  console.log(`Total de disciplinas a converter: ${CONVERSOES.length}\n`);

  try {
    await client.query('BEGIN');
    let divergencias = 0;
    let atualizadas = 0;

    for (const item of CONVERSOES) {
      const { rows } = await client.query(
        'SELECT id, nome FROM disciplinas_catalogo WHERE id = $1',
        [item.id]
      );

      if (rows.length === 0) {
        console.log(`[AVISO] id=${item.id} não encontrado — pulando.`);
        divergencias++;
        continue;
      }

      const nomeNoBanco = rows[0].nome;
      if (nomeNoBanco !== item.atual) {
        console.log(`[DIVERGÊNCIA] id=${item.id}: esperado "${item.atual}", encontrado "${nomeNoBanco}" — pulando por segurança.`);
        divergencias++;
        continue;
      }

      await client.query('UPDATE disciplinas_catalogo SET nome = $1 WHERE id = $2', [item.novo, item.id]);
      console.log(`id=${item.id}: "${item.atual}" -> "${item.novo}"`);
      atualizadas++;
    }

    console.log(`\nResumo: ${atualizadas} atualizadas, ${divergencias} puladas por divergência/ausência.`);

    if (APLICAR) {
      await client.query('COMMIT');
      console.log('\n✅ COMMIT realizado — alterações aplicadas.');
    } else {
      await client.query('ROLLBACK');
      console.log('\n↩️  ROLLBACK (dry-run) — nenhuma alteração persistida. Rode com --aplicar para aplicar de fato.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — ROLLBACK executado.', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
