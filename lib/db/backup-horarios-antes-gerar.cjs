// Backup de segurança da tabela horarios antes de rodar o gerador
// oficial pela primeira vez -- salva tudo numa tabela separada, pra
// dar pra restaurar se o resultado gerado ficar ruim.
//
// Uso:
//   node backup-horarios-antes-gerar.cjs            → dry-run (ROLLBACK)
//   node backup-horarios-antes-gerar.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const nomeTabela = `horarios_backup_${new Date().toISOString().slice(0,10).replace(/-/g,"")}`;

    await client.query(`DROP TABLE IF EXISTS ${nomeTabela}`);
    await client.query(`
      CREATE TABLE ${nomeTabela} AS
      SELECT * FROM horarios WHERE escola_id = $1
    `, [ESCOLA_ID]);

    const contagem = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeTabela}`);
    console.log(`Backup criado: tabela "${nomeTabela}" com ${contagem.rows[0].total} linhas.`);
    console.log(`\nPara restaurar depois, se precisar:`);
    console.log(`  DELETE FROM horarios WHERE escola_id = '${ESCOLA_ID}';`);
    console.log(`  INSERT INTO horarios SELECT * FROM ${nomeTabela};`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO — backup salvo de verdade.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — rode com --aplicar pra criar o backup de verdade.");
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
