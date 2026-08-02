const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const real = await client.query(`
      SELECT t.nome AS turma, t.turno, h.dia_semana, h.numero_aula
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.professor_id = 672
        AND h.disciplina_id = (SELECT id FROM disciplinas WHERE nome = 'Leitura e Recomposição da Aprendizagem - Língua Portuguesa' LIMIT 1)
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `);
    console.log("=== HORARIO REAL DA SILMARA (so Recomposicao) ===");
    console.table(real.rows);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
