const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.professor_id, p.nome AS professor_nome, td.professor_apoio_id
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      JOIN professores p ON p.id = td.professor_id
      WHERE t.nome IN ('6TH', '6TI', '9TG', '9TH', '9TI')
        AND d.nome = 'Recomposição da Aprendizagem - Matemática'
      ORDER BY t.nome
    `);
    console.table(rows.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
