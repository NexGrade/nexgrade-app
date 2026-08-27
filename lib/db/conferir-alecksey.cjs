const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const PROFESSOR_ID = 841; // Alecksey

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const total = await client.query(
      `SELECT COUNT(*)::int AS total FROM horarios WHERE professor_id = $1 AND escola_id = $2`,
      [PROFESSOR_ID, ESCOLA_ID]
    );
    console.log(`Total de aulas do Alecksey (id ${PROFESSOR_ID}) na tabela horarios: ${total.rows[0].total}\n`);

    const rows = await client.query(`
      SELECT h.dia_semana, h.numero_aula, t.nome AS turma, d.nome AS disciplina
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.professor_id = $1 AND h.escola_id = $2
      ORDER BY h.dia_semana, h.numero_aula;
    `, [PROFESSOR_ID, ESCOLA_ID]);
    console.log(JSON.stringify(rows.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
