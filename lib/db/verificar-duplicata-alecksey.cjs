const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT h.id, t.nome AS turma, h.dia_semana, h.numero_aula, p.nome AS professor, d.nome AS disciplina
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.escola_id = $1 AND (t.id, h.dia_semana, h.numero_aula) IN (
        SELECT h2.turma_id, h2.dia_semana, h2.numero_aula
        FROM horarios h2
        WHERE h2.professor_id = 841 AND h2.escola_id = $1
      )
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `, [ESCOLA_ID]);
    console.log(`Total de linhas encontradas (incluindo o Alecksey): ${r.rows.length}`);
    console.log(JSON.stringify(r.rows, null, 2));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
