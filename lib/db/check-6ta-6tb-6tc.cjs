const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT td.id, t.nome AS turma, td.professor_id, p.nome AS professor_atual
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      LEFT JOIN professores p ON p.id = td.professor_id
      WHERE t.nome IN ('6TA', '6TB', '6TC')
        AND td.disciplina_id = (SELECT id FROM disciplinas WHERE nome = 'Leitura e Recomposição da Aprendizagem - Língua Portuguesa' LIMIT 1)
    `);
    console.table(rows.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
