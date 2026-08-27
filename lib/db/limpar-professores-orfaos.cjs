// limpar-professores-orfaos.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Apaga os 12 professores do Mário Braga sem nenhum vínculo em
// professor_disciplinas nem turma_disciplinas:
//   - 693, 694, 695: duplicatas de "Francielle S." (mesmo email, criadas em sequência)
//   - 686, 687, 696-702: sem vínculo (Sueli, Clair, Camila, Doraci, Hericleia,
//     Kauana, Noeli, Rosinei, Silvana)
//
// Antes de apagar de `professores`, limpa linhas relacionadas em
// disponibilidade_professores, licencas_professores e limites_diarios_professor,
// se existirem, para não deixar lixo órfão nem quebrar por FK.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

const IDS_A_APAGAR = [686, 687, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString() };

  try {
    await client.query('BEGIN');

    // Segurança: recheck que nenhum ainda tem vínculo
    const aindaLigadoRes = await client.query(`
      SELECT DISTINCT professor_id FROM (
        SELECT professor_id FROM professor_disciplinas WHERE professor_id = ANY($1)
        UNION
        SELECT professor_id FROM turma_disciplinas WHERE professor_id = ANY($1)
      ) x
    `, [IDS_A_APAGAR]);
    if (aindaLigadoRes.rows.length > 0) {
      console.error('ERRO DE SEGURANÇA: algum dos ids ainda tem vínculo. Abortando.');
      console.table(aindaLigadoRes.rows);
      await client.query('ROLLBACK');
      process.exit(1);
    }
    console.log('Confirmado: nenhum dos 12 tem vínculo em professor_disciplinas ou turma_disciplinas.\n');

    // Limpar tabelas relacionadas, se existirem
    for (const tabela of ['disponibilidade_professores', 'licencas_professores', 'limites_diarios_professor']) {
      const colsRes = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [tabela]
      );
      const cols = colsRes.rows.map(r => r.column_name);
      const colProfessor = cols.includes('professor_id') ? 'professor_id' : null;
      if (!colProfessor) {
        console.log(`${tabela}: sem coluna professor_id, pulando.`);
        continue;
      }
      const delRes = await client.query(
        `DELETE FROM ${tabela} WHERE ${colProfessor} = ANY($1) RETURNING id`,
        [IDS_A_APAGAR]
      );
      console.log(`${tabela}: ${delRes.rowCount} linhas apagadas`);
      log[tabela] = delRes.rowCount;
    }

    // Apagar os professores
    const profDelRes = await client.query(
      `DELETE FROM professores WHERE id = ANY($1) AND escola_id = $2 RETURNING id, nome`,
      [IDS_A_APAGAR, MARIO_BRAGA_ORG_ID]
    );
    console.log(`\nProfessores apagados: ${profDelRes.rowCount}`);
    console.table(profDelRes.rows);
    log.professoresApagados = profDelRes.rows;

    // Conferência final
    const finalRes = await client.query(
      `SELECT COUNT(*) FROM professores WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]
    );
    console.log(`\nTotal de professores restantes no Mário Braga: ${finalRes.rows[0].count} (era 102, esperado 90)`);

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
    const logPath = path.join(__dirname, `log-limpar-professores-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
