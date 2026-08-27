/**
 * padronizar-nomes-abreviados-mb.cjs
 *
 * Padroniza 2 disciplinas do Mário Braga que estavam abreviadas,
 * usando o nome por extenso já em uso na Arlinda (mesmo codigo_sae),
 * identificados por comparar-nomes-mb-arlinda-completo.cjs.
 *
 * Uso:
 *   node lib\db\padronizar-nomes-abreviados-mb.cjs            (dry-run, padrão)
 *   node lib\db\padronizar-nomes-abreviados-mb.cjs --aplicar   (aplica de fato)
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
  { id: 1680, atual: 'Lid Org e Ges de Pessoas', novo: 'Liderança Organizacional e Gestão de Pessoas', codigo_sae: '5034' },
  { id: 1693, atual: 'Princ. de Administração',  novo: 'Princípios de Administração',                  codigo_sae: '4129' },
];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  console.log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);
  console.log(`Total de disciplinas a padronizar: ${CONVERSOES.length}\n`);

  try {
    await client.query('BEGIN');
    let divergencias = 0;
    let atualizadas = 0;

    for (const item of CONVERSOES) {
      const { rows } = await client.query(
        'SELECT id, nome, codigo_sae FROM disciplinas WHERE id = $1',
        [item.id]
      );

      if (rows.length === 0) {
        console.log(`[AVISO] id=${item.id} não encontrado — pulando.`);
        divergencias++;
        continue;
      }

      const atual = rows[0];
      if (atual.nome !== item.atual || atual.codigo_sae !== item.codigo_sae) {
        console.log(`[DIVERGÊNCIA] id=${item.id}: esperado nome="${item.atual}" codigo_sae="${item.codigo_sae}", encontrado nome="${atual.nome}" codigo_sae="${atual.codigo_sae}" — pulando por segurança.`);
        divergencias++;
        continue;
      }

      await client.query('UPDATE disciplinas SET nome = $1 WHERE id = $2', [item.novo, item.id]);
      console.log(`id=${item.id}: "${item.atual}" -> "${item.novo}" (codigo_sae ${item.codigo_sae})`);
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
