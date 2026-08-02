const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT h.id, t.nome AS turma, h.dia_semana, h.numero_aula, h.professor_id, p.nome AS professor_nome
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      WHERE t.nome IN ('6TH', '6TI', '9TG', '9TH', '9TI')
        AND h.disciplina_id = (SELECT id FROM disciplinas WHERE nome = 'Recomposição da Aprendizagem - Matemática' LIMIT 1)
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `);
    console.table(rows.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
