const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT t.nome AS turma, p.nome AS titular, pa.nome AS apoio
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN professores p ON p.id = td.professor_id
      LEFT JOIN professores pa ON pa.id = td.professor_apoio_id
      WHERE td.disciplina_id = (SELECT id FROM disciplinas WHERE nome = 'Recomposição da Aprendizagem - Matemática' LIMIT 1)
      ORDER BY t.nome
    `);
    console.table(rows.rows);
    console.log("Total de turmas:", rows.rows.length);
    console.log("Com apoio definido:", rows.rows.filter(r => r.apoio).length);
    console.log("SEM apoio definido:", rows.rows.filter(r => !r.apoio).length);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
