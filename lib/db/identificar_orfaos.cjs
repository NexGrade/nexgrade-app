const { Client } = require("pg");
const fs = require("fs");

const MARIO_BRAGA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const tabela of ["cursos", "disciplinas", "matrizes_curriculares"]) {
      const r = await client.query(
        `SELECT escola_id, COUNT(*) as total FROM "${tabela}" WHERE escola_id NOT IN ($1, $2) GROUP BY escola_id ORDER BY total DESC`,
        [MARIO_BRAGA, ARLINDA],
      );
      console.log(`\n=== ${tabela} -- valores de escola_id orfaos ===`);
      console.log(JSON.stringify(r.rows, null, 2));
    }

    // Amostra de nomes das disciplinas orfas, pra entender se sao lixo/teste ou dado real
    const amostra = await client.query(
      `SELECT id, nome, escola_id, created_at FROM disciplinas WHERE escola_id NOT IN ($1, $2) ORDER BY created_at DESC LIMIT 10`,
      [MARIO_BRAGA, ARLINDA],
    );
    console.log("\n=== Amostra de 10 disciplinas orfas mais recentes ===");
    console.log(JSON.stringify(amostra.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
