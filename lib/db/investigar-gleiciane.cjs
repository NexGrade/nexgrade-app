const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT h.id, t.turno, t.nome AS turma, h.dia_semana, h.numero_aula, d.nome AS disciplina
      FROM horarios h
      JOIN professores p ON p.id = h.professor_id
      JOIN turmas t ON t.id = h.turma_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE p.nome = 'Gleiciane Pauluk Rosario' AND h.escola_id = $1 AND h.dia_semana = 0 AND h.numero_aula = 3
    `, [ESCOLA_ID]);
    console.log(JSON.stringify(r.rows, null, 2));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
