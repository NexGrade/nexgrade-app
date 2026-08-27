const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const NOMES_PAEE = ["Camila", "Clair", "Doraci", "Fernanda", "Francielle", "Hericleia", "Kauana", "Noeli", "Rosinei", "Silvana", "Sueli"];

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const disc = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'PAEE'`,
      [ESCOLA_ID],
    );
    const disciplinaId = disc.rows[0].id;
    console.log(`Disciplina PAEE id=${disciplinaId}\n`);

    console.log("Professor -> tem vinculo professor_disciplinas com PAEE?");
    for (const nome of NOMES_PAEE) {
      const prof = await client.query(
        `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2`,
        [ESCOLA_ID, nome],
      );
      if (prof.rows.length === 0) {
        console.log(`  [NAO ENCONTRADO] ${nome}`);
        continue;
      }
      const professorId = prof.rows[0].id;
      const vinculo = await client.query(
        `SELECT id FROM professor_disciplinas WHERE professor_id = $1 AND disciplina_id = $2`,
        [professorId, disciplinaId],
      );
      const status = vinculo.rows.length > 0 ? "SIM" : "NAO -- FALTA CRIAR";
      console.log(`  ${nome} (id=${professorId}): ${status}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
