const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT pd.professor_id, p.nome, pd.disciplina_id
      FROM professor_disciplinas pd
      JOIN professores p ON p.id = pd.professor_id
      WHERE pd.disciplina_id = (SELECT id FROM disciplinas WHERE nome = 'Recomposição da Aprendizagem - Matemática' LIMIT 1)
      ORDER BY p.nome
    `);
    console.log("=== Vinculo generico (professor_disciplinas) para Recomposicao - Matematica ===");
    console.table(rows.rows);

    // confirma tambem quando o vinculo especifico (turma_disciplinas.professor_id do Gilberto) foi criado/atualizado
    const td = await client.query(`
      SELECT td.id, t.nome AS turma, td.professor_id
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      WHERE td.professor_id = 631
    `);
    console.log("=== turma_disciplinas do Gilberto ===");
    console.table(td.rows);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
