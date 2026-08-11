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

    for (const turma of turmasRes.rows) {
      console.log(`\n=== ${turma.nome} (id=${turma.id}) — TODOS os vínculos ===`);
      const res = await client.query(
        `SELECT
           d.nome AS disciplina,
           COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0) AS carga,
           p.nome AS professor_nome
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN professores p ON p.id = td.professor_id
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1
         ORDER BY d.nome`,
        [turma.id, turma.matriz_curricular_id]
      );
      let total = 0;
      for (const r of res.rows) {
        total += Number(r.carga);
        console.log(`  ${(r.disciplina ?? "??").padEnd(35)} carga=${r.carga}h  professor=${r.professor_nome ?? "NULO"}`);
      }
      console.log(`  TOTAL: ${total}h`);
    }

    // Também lista TODOS os itens da matriz compartilhada (487), pra
    // comparar com o que está vinculado em cada turma
    console.log(`\n=== Todos os itens da matriz compartilhada (id=487) ===`);
    const matrizRes = await client.query(
      `SELECT d.nome, im.carga_horaria_semanal
       FROM itens_matriz im
       JOIN disciplinas d ON d.id = im.disciplina_id
       WHERE im.matriz_curricular_id = 487
       ORDER BY d.nome`
    );
    for (const r of matrizRes.rows) {
      console.log(`  ${r.nome} (${r.carga_horaria_semanal}h)`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
