const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT t.nome AS turma, t.turno, t.nivel_ensino, p.nome AS titular, pa.nome AS apoio,
             COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      JOIN professores p ON p.id = td.professor_id
      LEFT JOIN professores pa ON pa.id = td.professor_apoio_id
      WHERE td.professor_id = 638
      ORDER BY t.turno, t.nome
    `);
    console.table(rows.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
