// merge-6ta-disciplinas.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Funde as 2 disciplinas usadas só pela turma 6TA nas versões canônicas
// usadas pelo resto do 6º ano (6TB-6TI):
//   2475 "Língua Inglesa"    -> 1682 "Língua Estrangeira Moderna - Inglês"
//   2474 "Língua Portuguesa" -> 1684 "Língua Portuguesa e Literatura"
//
// Depois do merge, verifica se 2475/2474 ainda têm algum vínculo (não deveriam);
// se estiverem livres, move para catalogo_disciplinas_seed e remove de disciplinas
// (mesmo padrão do merge anterior).

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERRO: não encontrei .env em ${envPath}`);
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('ERRO: DATABASE_URL não encontrada no .env');
  process.exit(1);
}
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

const MERGES = [
  { perdedor: 2475, vencedor: 1682, desc: 'Língua Inglesa -> Língua Estrangeira Moderna - Inglês' },
  { perdedor: 2474, vencedor: 1684, desc: 'Língua Portuguesa -> Língua Portuguesa e Literatura' },
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString(), merges: [], movidasParaCatalogo: [] };

  try {
    await client.query('BEGIN');

    for (const m of MERGES) {
      console.log(`\n--- Merge: ${m.desc} ---`);
      const antesRes = await client.query(
        `SELECT id, turma_id FROM turma_disciplinas WHERE disciplina_id = $1`, [m.perdedor]
      );
      console.log(`turma_disciplinas afetadas (antes): ${antesRes.rows.length}`);
      console.table(antesRes.rows);

      const updRes = await client.query(
        `UPDATE turma_disciplinas SET disciplina_id = $1 WHERE disciplina_id = $2 RETURNING id, turma_id`,
        [m.vencedor, m.perdedor]
      );
      console.log(`Atualizadas: ${updRes.rowCount}`);
      log.merges.push({ ...m, linhasAtualizadas: updRes.rows });
    }

    // Verificar se os perdedores ainda têm algum vínculo
    const idsPerdedores = MERGES.map(m => m.perdedor);
    const aindaLigadasRes = await client.query(
      `SELECT disciplina_id, COUNT(*) FROM turma_disciplinas WHERE disciplina_id = ANY($1) GROUP BY disciplina_id`,
      [idsPerdedores]
    );
    if (aindaLigadasRes.rows.length > 0) {
      console.error('\nAVISO: ainda há vínculos após o merge. Não vou apagar as disciplinas perdedoras.');
      console.table(aindaLigadasRes.rows);
    } else {
      console.log('\nConfirmado: perdedores sem nenhum vínculo restante. Movendo para o catálogo...');

      const perdedoresRes = await client.query(
        `SELECT id, nome, codigo_sae, sigla, categoria_curricular_padrao
         FROM disciplinas WHERE id = ANY($1) AND escola_id = $2`,
        [idsPerdedores, MARIO_BRAGA_ORG_ID]
      );

      for (const d of perdedoresRes.rows) {
        const insertRes = await client.query(
          `INSERT INTO catalogo_disciplinas_seed
             (disciplina_id_origem, nome, codigo_sae, sigla, categoria_curricular_padrao, escola_origem_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [d.id, d.nome, d.codigo_sae, d.sigla, d.categoria_curricular_padrao, MARIO_BRAGA_ORG_ID]
        );
        log.movidasParaCatalogo.push({ ...d, novoIdCatalogo: insertRes.rows[0].id });
      }

      // Apagar itens_matriz órfãos que ainda apontem pra elas (segurança)
      const imDelRes = await client.query(
        `DELETE FROM itens_matriz WHERE disciplina_id = ANY($1) RETURNING id`, [idsPerdedores]
      );
      console.log(`itens_matriz removidos: ${imDelRes.rowCount}`);

      const discDelRes = await client.query(
        `DELETE FROM disciplinas WHERE id = ANY($1) AND escola_id = $2 RETURNING id, nome`,
        [idsPerdedores, MARIO_BRAGA_ORG_ID]
      );
      console.log(`Disciplinas removidas: ${discDelRes.rowCount}`);
      console.table(discDelRes.rows);
    }

    // Conferência final: 6TA agora deve ter conjunto idêntico a 6TB
    const confRes = await client.query(`
      SELECT t.nome, array_agg(d.nome ORDER BY d.nome) AS disciplinas
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE t.escola_id = $1 AND t.nome IN ('6TA', '6TB')
      GROUP BY t.nome
    `, [MARIO_BRAGA_ORG_ID]);
    console.log('\n--- Conferência: 6TA vs 6TB após o merge ---');
    for (const row of confRes.rows) {
      console.log(`${row.nome}: ${row.disciplinas.join(', ')}`);
    }

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
    const logPath = path.join(__dirname, `log-merge-6ta-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
