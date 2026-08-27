const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    const disc = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'PAEE'`,
      [ESCOLA_ID],
    );
    const disciplinaId = disc.rows[0].id;

    for (const nome of ["Fernanda", "Francielle"]) {
      const prof = await client.query(
        `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2`,
        [ESCOLA_ID, nome],
      );
      const professorId = prof.rows[0].id;

      const jaTem = await client.query(
        `SELECT id FROM professor_disciplinas WHERE professor_id = $1 AND disciplina_id = $2`,
        [professorId, disciplinaId],
      );
      if (jaTem.rows.length > 0) {
        console.log(`${nome} (id=${professorId}) ja tem vinculo -- pulando`);
        continue;
      }
      console.log(`${nome} (id=${professorId}): vinculo com PAEE sera criado`);
      if (aplicar) {
        await client.query(
          `INSERT INTO professor_disciplinas (professor_id, disciplina_id) VALUES ($1, $2)`,
          [professorId, disciplinaId],
        );
      }
    }

    if (aplicar) {
      await client.query("COMMIT");
      console.log("\nOK: vinculos criados de verdade (--aplicar usado).");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- nada foi alterado. Rode com --aplicar para confirmar.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
