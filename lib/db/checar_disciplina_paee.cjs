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
    const r = await client.query(
      `SELECT id, nome, sigla FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%PAEE%'`,
      [ESCOLA_ID],
    );
    console.log("Disciplinas com PAEE no nome:", JSON.stringify(r.rows, null, 2));

    const emails = await client.query(
      `SELECT email FROM professores WHERE escola_id = $1 AND email ILIKE '%pendente%'`,
      [ESCOLA_ID],
    );
    console.log("Emails ja usando 'pendente' (verificar colisao):", JSON.stringify(emails.rows));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
