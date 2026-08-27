/**
 * investigar-timeline-disponibilidade.cjs
 * Script SOMENTE LEITURA.
 *
 * Confere QUANDO os bloqueios de disponibilidade dos professores do
 * Mario Braga foram criados -- pra saber se sao dados antigos (de
 * antes do "101s" conhecido) ou se cresceram/mudaram recentemente,
 * inclusive durante a sessao de hoje.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID_MARIO_BRAGA = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    // Professores do Mario Braga
    const professores = (await client.query(
      `SELECT id FROM professores WHERE escola_id = $1`, [ESCOLA_ID_MARIO_BRAGA]
    )).rows.map(r => r.id);

    // Distribuição de created_at dos bloqueios (disponivel=false) desses professores
    const { rows: distribuicao } = await client.query(
      `SELECT DATE(created_at) AS dia, COUNT(*) AS total
       FROM disponibilidade_professores
       WHERE professor_id = ANY($1) AND disponivel = false
       GROUP BY DATE(created_at)
       ORDER BY dia`,
      [professores]
    );
    console.log('Bloqueios de indisponibilidade (professores Mario Braga) por dia de criação:');
    for (const r of distribuicao) console.log(`  ${r.dia.toISOString().slice(0,10)}: ${r.total} bloqueio(s)`);

    const { rows: totalGeral } = await client.query(
      `SELECT COUNT(*) AS total, MIN(created_at) AS mais_antigo, MAX(created_at) AS mais_recente
       FROM disponibilidade_professores WHERE professor_id = ANY($1) AND disponivel = false`,
      [professores]
    );
    console.log(`\nTotal geral: ${totalGeral[0].total} bloqueios`);
    console.log(`Mais antigo: ${totalGeral[0].mais_antigo}`);
    console.log(`Mais recente: ${totalGeral[0].mais_recente}`);

    // Confirma que nenhum script do catalogo mexeu em disciplinas.carga_semanal
    // ou turma_disciplinas -- verifica timeline de updated_at dessas tabelas tambem
    const { rows: turmaDiscsUpdated } = await client.query(
      `SELECT DATE(td.id) FILTER (WHERE false) AS nao_aplica LIMIT 0` // placeholder, turma_disciplinas nao tem updated_at
    ).catch(() => ({ rows: [] }));

    const { rows: discsUpdated } = await client.query(
      `SELECT DATE(updated_at) AS dia, COUNT(*) AS total
       FROM disciplinas WHERE escola_id = $1
       GROUP BY DATE(updated_at) ORDER BY dia DESC LIMIT 10`,
      [ESCOLA_ID_MARIO_BRAGA]
    );
    console.log('\nDisciplinas do Mario Braga -- updated_at por dia (mostra quando os nomes foram alterados):');
    for (const r of discsUpdated) console.log(`  ${r.dia.toISOString().slice(0,10)}: ${r.total} disciplina(s)`);

  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
