const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT t.nome AS turma, h.dia_semana, h.numero_aula, COUNT(DISTINCT h.professor_id)::int AS qtd,
             array_agg(DISTINCT p.nome) AS professores
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      WHERE h.escola_id = $1 AND t.turno = 'matutino'
      GROUP BY t.nome, h.dia_semana, h.numero_aula
      HAVING COUNT(DISTINCT h.professor_id) > 2
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `, [ESCOLA_ID]);
    console.log(`Slots com MAIS de 2 professores no matutino: ${r.rows.length}`);
    r.rows.forEach(row => console.log(`  ${row.turma} dia=${row.dia_semana} aula=${row.numero_aula}: ${row.professores.join(" + ")}`));

    const total = await client.query(`
      SELECT COUNT(*)::int AS total FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = 'matutino'
    `, [ESCOLA_ID]);
    console.log(`\nTotal de linhas atuais no matutino: ${total.rows[0].total}`);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
