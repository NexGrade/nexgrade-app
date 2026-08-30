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
      WHERE h.escola_id = $1 AND t.nome = '6TA' AND h.dia_semana = 0 AND h.numero_aula = 3
    `, [ESCOLA_ID]);
    console.log("6TA, Segunda, 3ª aula:");
    console.log(JSON.stringify(r.rows, null, 2));

    const r2 = await client.query(`
      SELECT h.id, t.nome AS turma, h.dia_semana, h.numero_aula, p.nome AS professor, d.nome AS disciplina
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.escola_id = $1 AND t.nome = '6TA' AND h.dia_semana = 1 AND h.numero_aula = 3
    `, [ESCOLA_ID]);
    console.log("\n6TA, Terça, 3ª aula:");
    console.log(JSON.stringify(r2.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
