const { Client } = require("pg");

const SILMARA_ID_QUERY = "SELECT id FROM professores WHERE nome = 'Silmara' LIMIT 1";
const TURMAS = ["6TD", "6TE", "6TF", "6TG", "6TH", "6TI"];
const DISCIPLINA_NOME = "Leitura e Recomposição da Aprendizagem - Língua Portuguesa";
const DRY_RUN = process.argv[2] !== "--confirmar";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const silmara = await client.query(SILMARA_ID_QUERY);
    if (silmara.rows.length === 0) throw new Error("Professora Silmara nao encontrada");
    const silmaraId = silmara.rows[0].id;
    console.log("Silmara id:", silmaraId);

    const antes = await client.query(`
      SELECT td.id, t.nome AS turma, td.professor_id, p.nome AS titular, td.professor_apoio_id, pa.nome AS apoio_atual
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN professores p ON p.id = td.professor_id
      LEFT JOIN professores pa ON pa.id = td.professor_apoio_id
      WHERE t.nome = ANY($1) AND td.disciplina_id = (SELECT id FROM disciplinas WHERE nome = $2 LIMIT 1)
      ORDER BY t.nome
    `, [TURMAS, DISCIPLINA_NOME]);
    console.log("=== ANTES ===");
    console.table(antes.rows);

    const resultado = await client.query(`
      UPDATE turma_disciplinas
      SET professor_apoio_id = $1
      WHERE turma_id IN (SELECT id FROM turmas WHERE nome = ANY($2))
        AND disciplina_id = (SELECT id FROM disciplinas WHERE nome = $3 LIMIT 1)
      RETURNING id
    `, [silmaraId, TURMAS, DISCIPLINA_NOME]);
    console.log("Linhas atualizadas:", resultado.rowCount);

    const depois = await client.query(`
      SELECT td.id, t.nome AS turma, td.professor_id, p.nome AS titular, td.professor_apoio_id, pa.nome AS apoio
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN professores p ON p.id = td.professor_id
      LEFT JOIN professores pa ON pa.id = td.professor_apoio_id
      WHERE t.nome = ANY($1) AND td.disciplina_id = (SELECT id FROM disciplinas WHERE nome = $2 LIMIT 1)
      ORDER BY t.nome
    `, [TURMAS, DISCIPLINA_NOME]);
    console.log("=== DEPOIS ===");
    console.table(depois.rows);

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("\n>>> DRY-RUN: nada foi salvo. <<<");
    } else {
      await client.query("COMMIT");
      console.log("\n>>> APLICADO COM SUCESSO. <<<");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ERRO -- nada foi salvo:", err.message);
  } finally {
    await client.end();
  }
}

main();
