const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

const ESCOLA_MARIO = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log('=== Candidatos a "R MAT" (Recomposição Matemática) ===');
    const rmatRes = await client.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%recom%mat%' ORDER BY nome`,
      [ESCOLA_MARIO]
    );
    for (const r of rmatRes.rows) console.log(`  id=${r.id} nome="${r.nome}"`);

    console.log("\n=== Disciplinas básicas (nome exato) ===");
    const basicas = ["Arte", "Educação Física", "Geografia", "Matemática", "Língua Inglesa", "Língua Portuguesa", "História", "Ciências", "Ensino Religioso"];
    for (const nome of basicas) {
      const res = await client.query(
        `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome = $2 LIMIT 1`,
        [ESCOLA_MARIO, nome]
      );
      if (res.rows[0]) {
        console.log(`  ✅ "${nome}": id=${res.rows[0].id}`);
      } else {
        console.log(`  ❌ "${nome}": não encontrada (nome exato) -- tentando variações...`);
        const parecidos = await client.query(
          `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome ILIKE $2 ORDER BY nome LIMIT 5`,
          [ESCOLA_MARIO, `%${nome}%`]
        );
        for (const p of parecidos.rows) console.log(`       parecido: id=${p.id} nome="${p.nome}"`);
      }
    }

    console.log("\n=== Turma 6TA -- confirma id, turno, nivel_ensino, matriz_curricular_id ===");
    const turmaRes = await client.query(
      `SELECT id, nome, turno, nivel_ensino, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = '6TA'`,
      [ESCOLA_MARIO]
    );
    console.log(turmaRes.rows);

    console.log("\n=== Vínculos atuais de 6TA em turma_disciplinas ===");
    if (turmaRes.rows[0]) {
      const vincRes = await client.query(
        `SELECT td.id, d.nome AS disciplina, td.professor_id, td.carga_horaria_semanal_override
         FROM turma_disciplinas td LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         WHERE td.turma_id = $1`,
        [turmaRes.rows[0].id]
      );
      for (const v of vincRes.rows) console.log(" ", JSON.stringify(v));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
