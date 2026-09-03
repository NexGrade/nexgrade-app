// Corrige a duplicata "Estrategias de Marketing" (id 1650) -> move as
// referencias pra "Estrategia de Marketing" (id 2957) e apaga a 1650.
//
// Uso:
//   node corrigir-duplicata-disciplina-marketing.cjs            -> dry-run
//   node corrigir-duplicata-disciplina-marketing.cjs --aplicar   -> aplica

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const DUPLICATA_ID = 1650;
const CANONICA_ID = 2957;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const td = await client.query(
      `SELECT id, turma_id FROM turma_disciplinas WHERE disciplina_id = $1`,
      [DUPLICATA_ID]
    );
    console.log(`turma_disciplinas com a duplicata: ${td.rowCount}`);

    for (const row of td.rows) {
      const jaTemCanonica = await client.query(
        `SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
        [row.turma_id, CANONICA_ID]
      );
      if (jaTemCanonica.rowCount > 0) {
        console.log(`  [CONFLITO] turma_id=${row.turma_id} ja tem turma_disciplinas pra id ${CANONICA_ID} (id existente=${jaTemCanonica.rows[0].id}). Removendo a linha duplicada (id=${row.id}) em vez de atualizar, pra nao violar unicidade.`);
        await client.query(`DELETE FROM turma_disciplinas WHERE id = $1`, [row.id]);
      } else {
        console.log(`  [MOVE] turma_disciplinas id=${row.id} (turma_id=${row.turma_id}): disciplina_id ${DUPLICATA_ID} -> ${CANONICA_ID}`);
        await client.query(`UPDATE turma_disciplinas SET disciplina_id = $1 WHERE id = $2`, [CANONICA_ID, row.id]);
      }
    }

    const hRes = await client.query(
      `UPDATE horarios SET disciplina_id = $1 WHERE disciplina_id = $2 RETURNING id`,
      [CANONICA_ID, DUPLICATA_ID]
    );
    console.log(`horarios movidos: ${hRes.rowCount}`);

    const delRes = await client.query(`DELETE FROM disciplinas WHERE id = $1 RETURNING id, nome`, [DUPLICATA_ID]);
    console.log(`disciplina removida:`, delRes.rows[0]);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\nAPLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- rode com --aplicar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
