const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TURMA_ID = 377; // 1MB DES

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT h.id, h.dia_semana, h.numero_aula, p.id AS professor_id, p.nome AS professor_nome, d.nome AS disciplina
      FROM horarios h
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.turma_id = $1 AND h.escola_id = $2
      ORDER BY h.dia_semana, h.numero_aula;
    `, [TURMA_ID, ESCOLA_ID]);
    console.log(`Aulas da turma 1MB DES (id ${TURMA_ID}):`);
    console.log(JSON.stringify(rows.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
