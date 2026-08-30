// Restaura a tabela horarios a partir do backup feito antes de
// promover a grade experimental (que não tinha o Alecksey correto)
// pra oficial.
//
// Uso:
//   node restaurar-backup-horarios.cjs            → dry-run (ROLLBACK)
//   node restaurar-backup-horarios.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TABELA_BACKUP = "horarios_backup_20260827";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const antesBackup = await client.query(`SELECT COUNT(*)::int AS total FROM ${TABELA_BACKUP}`);
    const antesAtual = await client.query(`SELECT COUNT(*)::int AS total FROM horarios WHERE escola_id = $1`, [ESCOLA_ID]);
    console.log(`Backup tem: ${antesBackup.rows[0].total} linhas`);
    console.log(`Horarios atual (antes de restaurar): ${antesAtual.rows[0].total} linhas`);

    await client.query(`DELETE FROM horarios WHERE escola_id = $1`, [ESCOLA_ID]);
    await client.query(`INSERT INTO horarios SELECT * FROM ${TABELA_BACKUP}`);

    const depois = await client.query(`SELECT COUNT(*)::int AS total FROM horarios WHERE escola_id = $1`, [ESCOLA_ID]);
    console.log(`Horarios depois de restaurar: ${depois.rows[0].total} linhas`);

    const alecksey = await client.query(
      `SELECT COUNT(*)::int AS total FROM horarios WHERE professor_id = 841 AND escola_id = $1`,
      [ESCOLA_ID]
    );
    console.log(`Aulas do Alecksey depois de restaurar: ${alecksey.rows[0].total} (esperado: 31)`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO — grade oficial restaurada.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Rode com --aplicar.");
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
