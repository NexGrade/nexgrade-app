const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT h.dia_semana, h.numero_aula, t.nome as turma_nome, t.turno, d.nome as disciplina_nome
       FROM horarios h
       JOIN professores p ON p.id = h.professor_id
       JOIN turmas t ON t.id = h.turma_id
       JOIN disciplinas d ON d.id = h.disciplina_id
       WHERE p.escola_id = $1 AND p.nome = 'Camila'
       ORDER BY h.dia_semana, h.numero_aula
       LIMIT 5`,
      [ESCOLA_ID],
    );
    console.log("Primeiras 5 aulas da Camila:");
    console.log(JSON.stringify(r.rows, null, 2));

    const total = await client.query(
      `SELECT COUNT(*) as total FROM horarios h JOIN professores p ON p.id = h.professor_id WHERE p.escola_id = $1 AND p.nome = 'Camila'`,
      [ESCOLA_ID],
    );
    console.log(`\nTotal de aulas da Camila: ${total.rows[0].total}`);

    const resumo = await client.query(
      `SELECT p.nome, COUNT(h.id) as total_aulas
       FROM professores p
       JOIN horarios h ON h.professor_id = p.id
       WHERE p.escola_id = $1 AND h.disciplina_id = (SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'PAEE')
       GROUP BY p.nome
       ORDER BY p.nome`,
      [ESCOLA_ID],
    );
    console.log("\nResumo final de todos os professores PAEE:");
    console.log(JSON.stringify(resumo.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
