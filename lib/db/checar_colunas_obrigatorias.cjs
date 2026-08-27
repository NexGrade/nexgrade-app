const { Client } = require("pg");
const fs = require("fs");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const tabela of ["disciplinas", "professores", "professor_disciplinas"]) {
      const r = await client.query(
        `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = $1
         ORDER BY ordinal_position`,
        [tabela],
      );
      console.log(`\n=== ${tabela} ===`);
      for (const row of r.rows) {
        console.log(`  ${row.column_name}  (nullable=${row.is_nullable}, default=${row.column_default ?? "-"})`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
