const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT t.nome AS turma, t.turno, h.dia_semana, h.numero_aula, p.nome AS professor, d.nome AS disciplina
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.escola_id = $1 AND t.turno = 'vespertino' AND d.nome ILIKE '%Rec. Aprend%'
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `, [ESCOLA_ID]);
    console.log(`Total de aulas "Rec. Aprend." no vespertino: ${r.rows.length}`);
    console.log(JSON.stringify(r.rows, null, 2));
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
