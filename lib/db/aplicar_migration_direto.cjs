const { Client } = require("pg");
const fs = require("fs");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log("Aplicando: ALTER TABLE horarios ALTER COLUMN turma_id SET NOT NULL...");
    await client.query(`ALTER TABLE "horarios" ALTER COLUMN "turma_id" SET NOT NULL`);
    console.log("  -> OK");

    console.log("Aplicando: ALTER TABLE horarios DROP COLUMN turno...");
    await client.query(`ALTER TABLE "horarios" DROP COLUMN "turno"`);
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
