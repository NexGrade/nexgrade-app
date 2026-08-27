/**
 * conferir-teoria-tecnica.cjs
 * Script SOMENTE LEITURA.
 *
 * Confere o resultado da sincronização do id=2432 (molde), que tinha
 * "Teoria e técnica" e virou "Teoria e Técnica Profissional" (nome do
 * catálogo id=641, codigo_sae=4934). Verifica se o valor atual está
 * correto pós-aplicação, e mostra o contexto (curso/matriz) onde essa
 * disciplina é usada, se disponível.
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
    const { rows } = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE id = 2432`
    );
    log('Molde id=2432 após sincronização:');
    for (const r of rows) log(JSON.stringify(r, null, 2));

    const { rows: catalogo } = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE id = 641`
    );
    log('\nCatálogo id=641 (fonte usada na sincronização):');
    for (const r of catalogo) log(JSON.stringify(r, null, 2));

    // Ver em quais itens_matriz (cursos) essa disciplina do molde aparece
    const { rows: matriz } = await client.query(
      `SELECT im.id, im.curso_id, c.nome AS curso_nome
       FROM itens_matriz im
       LEFT JOIN cursos c ON c.id = im.curso_id
       WHERE im.disciplina_id = 2432`
    );
    log('\nUsado nos cursos:');
    for (const m of matriz) log(JSON.stringify(m));
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, 'conferir-teoria-tecnica-relatorio.txt'), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main();
