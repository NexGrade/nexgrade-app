const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT t.nome AS turma, h.dia_semana, h.numero_aula, p.nome AS professor, d.nome AS disciplina
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE t.nome IN ('6TA','6TB')
        AND h.dia_semana IN (0,1,3)
        AND h.numero_aula IN (2,3,4)
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `);
    console.table(rows.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
