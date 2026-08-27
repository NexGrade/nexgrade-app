// unificar-rec-aprend-lport-3nb-3nc.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Unifica id=1703 "Recomposição da Aprendizagem - Língua Portuguesa"
// (usada em 3NB/3NC) com a disciplina já canonizada "Rec. Aprend. L. Port"
// (id=1678, resultado do merge do 6TA + padronizacao de nomes feitos
// hoje mais cedo). Mesmo padrão do merge do 6TA: atualiza
// turma_disciplinas pra apontar pro id canonico, confirma que nada mais
// referencia o id antigo, e apaga a linha duplicada.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const CANONICO_ID = 1678; // "Rec. Aprend. L. Port"
const PERDEDOR_ID = 1703; // "Recomposição da Aprendizagem - Língua Portuguesa"

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString() };

  try {
    await client.query('BEGIN');

    const antesRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE id = ANY($1) AND escola_id = $2`,
      [[CANONICO_ID, PERDEDOR_ID], MARIO_BRAGA_ORG_ID]
    );
    console.log('Estado atual:');
    console.table(antesRes.rows);

    if (antesRes.rows.length < 2) {
      console.error('ERRO: um dos dois ids não foi encontrado no Mário Braga. Abortando.');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const usoRes = await client.query(
      `SELECT td.id AS turma_disciplina_id, t.nome AS turma_nome, td.professor_id
       FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id
       WHERE td.disciplina_id = $1`,
      [PERDEDOR_ID]
    );
    console.log(`\nTurmas usando id=${PERDEDOR_ID} (serão migradas):`);
    console.table(usoRes.rows);

    const updRes = await client.query(
      `UPDATE turma_disciplinas SET disciplina_id = $1 WHERE disciplina_id = $2 RETURNING id, turma_id`,
      [CANONICO_ID, PERDEDOR_ID]
    );
    console.log(`\nLinhas de turma_disciplinas migradas: ${updRes.rowCount}`);
    log.migradas = updRes.rows;

    const aindaRes = await client.query(
      `SELECT COUNT(*) FROM turma_disciplinas WHERE disciplina_id = $1`,
      [PERDEDOR_ID]
    );
    if (Number(aindaRes.rows[0].count) > 0) {
      console.error('ERRO DE SEGURANÇA: ainda há vínculos após a migração. Abortando.');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const imRes = await client.query(
      `SELECT COUNT(*) FROM itens_matriz WHERE disciplina_id = $1`,
      [PERDEDOR_ID]
    );
    if (Number(imRes.rows[0].count) > 0) {
      console.log(`Atualizando ${imRes.rows[0].count} linha(s) de itens_matriz também...`);
      await client.query(`UPDATE itens_matriz SET disciplina_id = $1 WHERE disciplina_id = $2`, [CANONICO_ID, PERDEDOR_ID]);
    }

    const delRes = await client.query(
      `DELETE FROM disciplinas WHERE id = $1 AND escola_id = $2 RETURNING id, nome`,
      [PERDEDOR_ID, MARIO_BRAGA_ORG_ID]
    );
    console.log(`\n✅ Apagada disciplina duplicada: id=${delRes.rows[0]?.id} "${delRes.rows[0]?.nome}"`);
    log.apagada = delRes.rows[0];

    const confRes = await client.query(`
      SELECT t.nome AS turma, d.id AS disciplina_id, d.nome AS disciplina_nome
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE t.escola_id = $1 AND t.nome IN ('3NB', '3NC') AND d.id = $2
    `, [MARIO_BRAGA_ORG_ID, CANONICO_ID]);
    console.log('\nConferência (3NB/3NC agora usando o id canônico):');
    console.table(confRes.rows);

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]);
    console.log(`\nTotal de disciplinas do Mário Braga: ${totalRes.rows[0].count} (era 96)`);

    if (APLICAR) {
      await client.query('COMMIT');
      console.log('\n✅ COMMIT realizado.');
    } else {
      await client.query('ROLLBACK');
      console.log('\n↩️  ROLLBACK (dry-run). Rode com --aplicar para efetivar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERRO — ROLLBACK executado:', err);
    process.exit(1);
  } finally {
    const logPath = path.join(__dirname, `log-unificar-rec-aprend-lport-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
