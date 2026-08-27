const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const registros = await client.query(
      `SELECT dados_anteriores->>'nome' as nome, created_at
       FROM audit_logs
       WHERE escola_id = $1 AND entidade = 'professores' AND acao = 'exclusao'
       ORDER BY created_at DESC`,
      [ESCOLA_ID],
    );
    for (const row of registros.rows) {
      console.log(`${row.created_at}  -  ${row.nome}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
