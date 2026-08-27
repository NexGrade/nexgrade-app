/**
 * converter-arabico-romano-mb.cjs
 *
 * Converte o sufixo numeral de arábico (1, 2, 3) para romano (I, II, III)
 * em disciplinas específicas do Mário Braga, alinhando ao padrão do produto
 * (registrado na memória: variantes numeradas por nível sempre usam romano).
 *
 * Alvo: IDs explícitos identificados pelo pente-fino-duas-escolas.cjs
 * (blast radius mínimo — nenhuma outra disciplina é tocada).
 *
 * Uso:
 *   node lib\db\converter-arabico-romano-mb.cjs            (dry-run, padrão)
 *   node lib\db\converter-arabico-romano-mb.cjs --aplicar   (aplica de fato)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// --- Carrega DATABASE_URL do .env ---
function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo
    .split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) {
    throw new Error('DATABASE_URL não encontrada no .env');
  }
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  // remove aspas se existirem
  valor = valor.replace(/^["']|["']$/g, '');
  return valor;
}

const APLICAR = process.argv.includes('--aplicar');

// --- Lista de conversões: id -> {nomeEsperadoAtual, nomeNovo} ---
// nomeEsperadoAtual é usado como checagem de segurança antes do UPDATE.
const CONVERSOES = [
  { id: 1621, atual: 'Análise Cont e Quim Amb 1', novo: 'Análise Cont e Quim Amb I' },
  { id: 1625, atual: 'Arte 2',                     novo: 'Arte II' },
  { id: 1628, atual: 'Banco de Dados 1',            novo: 'Banco de Dados I' },
  { id: 1629, atual: 'Banco de Dados 2',            novo: 'Banco de Dados II' },
  { id: 1632, atual: 'Biologia 2',                  novo: 'Biologia II' },
  { id: 1643, atual: 'Educação Ambiental 1',        novo: 'Educação Ambiental I' },
  { id: 1652, atual: 'Farmacologia 1',              novo: 'Farmacologia I' },
  { id: 1653, atual: 'Farmacologia 2',              novo: 'Farmacologia II' },
  { id: 1661, atual: 'Física 2',                    novo: 'Física II' },
  { id: 1662, atual: 'Física 3',                    novo: 'Física III' },
  { id: 1664, atual: 'Geografia 1',                 novo: 'Geografia I' },
  { id: 1667, atual: 'Gestão de Rec Naturais 1',    novo: 'Gestão de Rec Naturais I' },
  { id: 1671, atual: 'História 1',                  novo: 'História I' },
  { id: 1683, atual: 'Língua Inglesa 1',            novo: 'Língua Inglesa I' },
  { id: 1688, atual: 'Matemática 2',                novo: 'Matemática II' },
  { id: 1697, atual: 'Programação Back End 1',      novo: 'Programação Back End I' },
  { id: 1702, atual: 'Química 1',                   novo: 'Química I' },
  { id: 1712, atual: 'Sociologia 1',                novo: 'Sociologia I' },
];

async function main() {
  const connectionString = carregarDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  console.log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);
  console.log(`Total de disciplinas a converter: ${CONVERSOES.length}\n`);

  try {
    await client.query('BEGIN');

    let divergencias = 0;
    let atualizadas = 0;

    for (const item of CONVERSOES) {
      // 1. Checagem de segurança: confirma que o nome atual no banco
      //    bate com o esperado, antes de tocar na linha.
      const { rows } = await client.query(
        'SELECT id, nome FROM disciplinas WHERE id = $1',
        [item.id]
      );

      if (rows.length === 0) {
        console.log(`[AVISO] id=${item.id} não encontrado — pulando.`);
        divergencias++;
        continue;
      }

      const nomeNoBanco = rows[0].nome;
      if (nomeNoBanco !== item.atual) {
        console.log(
          `[DIVERGÊNCIA] id=${item.id}: esperado "${item.atual}", encontrado "${nomeNoBanco}" — pulando por segurança.`
        );
        divergencias++;
        continue;
      }

      // 2. Update
      await client.query('UPDATE disciplinas SET nome = $1 WHERE id = $2', [
        item.novo,
        item.id,
      ]);

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
