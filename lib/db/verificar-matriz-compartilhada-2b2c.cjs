const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const turmasRes = await client.query(
      `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome IN ('2B','2C')`,
      [ESCOLA_ARLINDA]
    );
    for (const t of turmasRes.rows) {
      console.log(`\n=== Turma ${t.nome} (id=${t.id}) usa matriz_curricular_id=${t.matriz_curricular_id} ===`);

      const compartilhamRes = await client.query(
        `SELECT id, nome FROM turmas WHERE matriz_curricular_id = $1 AND escola_id = $2`,
        [t.matriz_curricular_id, ESCOLA_ARLINDA]
      );
      console.log(`  Turmas que usam essa MESMA matriz: ${compartilhamRes.rows.map(r => r.nome).join(", ")}`);

      const nomeMatrizRes = await client.query(
        `SELECT nome, curso_id FROM matrizes_curriculares WHERE id = $1`,
        [t.matriz_curricular_id]
      );
      if (nomeMatrizRes.rows[0]) {
        console.log(`  Nome da matriz: "${nomeMatrizRes.rows[0].nome}" (curso_id=${nomeMatrizRes.rows[0].curso_id})`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
