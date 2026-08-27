/**
 * checar-uso-catalogo-geral.cjs
 * Script SOMENTE LEITURA.
 *
 * Verifica quantas disciplinas existem com escola_id='catalogo_geral'
 * e se alguma delas está referenciada por turma_disciplinas ou
 * itens_matriz (ou seja, se está "em uso" real por alguma turma).
 * Isso decide se é seguro excluir esses registros.
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

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  try {
    const { rows: totalRows } = await client.query(
      `SELECT COUNT(*) AS total FROM disciplinas WHERE escola_id = 'catalogo_geral'`
    );
    log(`Total de disciplinas com escola_id='catalogo_geral': ${totalRows[0].total}\n`);

    // Descobrir todas as tabelas que têm uma coluna que parece referenciar disciplina
    const { rows: colunas } = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE column_name ILIKE '%disciplina%id%' AND table_name != 'disciplinas'
       ORDER BY table_name`
    );
    log('Tabelas com coluna que referencia disciplina:');
    for (const c of colunas) log(`- ${c.table_name}.${c.column_name}`);
    log('');

    // Para cada tabela encontrada, checar se alguma linha referencia um id de catalogo_geral
    const idsCatalogoGeral = (await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = 'catalogo_geral'`
    )).rows.map(r => r.id);

    if (idsCatalogoGeral.length === 0) {
      log('Nenhum id de catalogo_geral encontrado — nada a checar.');
    } else {
      for (const c of colunas) {
        const { rows: usoRows } = await client.query(
          `SELECT COUNT(*) AS total FROM ${c.table_name} WHERE ${c.column_name} = ANY($1)`,
          [idsCatalogoGeral]
        );
        log(`Referências de ${c.table_name}.${c.column_name} a ids de catalogo_geral: ${usoRows[0].total}`);
      }
    }

  } finally {
    await client.end();
    const relatorioPath = path.join(__dirname, 'uso-catalogo-geral-relatorio.txt');
    fs.writeFileSync(relatorioPath, linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main();
