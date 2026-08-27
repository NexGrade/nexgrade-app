const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const NOMES_PAEE = [
  "CAMILA",
  "CLAIR",
  "DORACI",
  "FERNANDA",
  "FRANCIELE DE ASSIS",
  "HERICLEIA",
  "KAUANA",
  "NOELI",
  "ROSINEI",
  "SILVANA",
  "SUELI",
];

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const todos = await client.query(
      `SELECT nome FROM professores WHERE escola_id = $1 ORDER BY nome`,
      [ESCOLA_ID],
    );
    const nomesAtuais = todos.rows.map((r) => r.nome.toUpperCase());

    console.log("=== Status de cada professor PAEE encontrado no Urania ===");
    for (const nome of NOMES_PAEE) {
      const encontrado = nomesAtuais.some((n) => n.includes(nome) || nome.includes(n.split(" ")[0]));
      console.log(`  ${encontrado ? "[JA CADASTRADO]" : "[FALTA -- foi excluido]"}  ${nome}`);
    }

    console.log("\n=== Lista completa de professores atuais (para conferencia manual) ===");
    console.log(nomesAtuais.join(", "));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
