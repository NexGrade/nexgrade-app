const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const ivanirNosMesmosSlots = await client.query(`
      SELECT t.nome AS turma, h.dia_semana, h.numero_aula, h.professor_id, p.nome
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      WHERE h.turma_id IN (SELECT id FROM turmas WHERE nome IN ('6TD','6TE','6TF','6TG','6TH','6TI'))
        AND h.professor_id = 638
      ORDER BY t.nome
    `);
    console.log("=== IVANIR em horarios de 6TD-6TI (qualquer disciplina) ===");
    console.table(ivanirNosMesmosSlots.rows);
    console.log("Total de linhas:", ivanirNosMesmosSlots.rowCount);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
