const { Client } = require("pg");
const fs = require("fs");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    console.log("Conectado com sucesso.");
    console.log("Aplicando: ALTER TABLE turmas ADD COLUMN fantasma...");
    await client.query(`ALTER TABLE "turmas" ADD COLUMN IF NOT EXISTS "fantasma" boolean DEFAULT false NOT NULL`);
    console.log("  -> OK");
    console.log("\nMigration aplicada com sucesso.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
