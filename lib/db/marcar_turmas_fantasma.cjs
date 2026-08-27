const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");

    const preview = await client.query(
      `SELECT id, nome, turno FROM turmas WHERE escola_id = $1 AND nome = 'PAEE'`,
      [ESCOLA_ID],
    );
    console.log(`${preview.rows.length} turma(s) PAEE encontrada(s):`);
    console.log(JSON.stringify(preview.rows, null, 2));

    if (aplicar) {
      const resultado = await client.query(
        `UPDATE turmas SET fantasma = true WHERE escola_id = $1 AND nome = 'PAEE'`,
        [ESCOLA_ID],
      );
      await client.query("COMMIT");
      console.log(`\nOK: ${resultado.rowCount} turma(s) marcada(s) como fantasma (--aplicar usado).`);
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- nada foi alterado. Rode com --aplicar para confirmar.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
