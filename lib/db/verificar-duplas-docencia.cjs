const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT t.nome AS turma, d.nome AS disciplina, COUNT(*)::int AS qtd_linhas,
             array_agg(p.nome) AS professores
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      LEFT JOIN professores p ON p.id = td.professor_id
      WHERE t.escola_id = $1
      GROUP BY t.nome, d.nome
      HAVING COUNT(*) > 1
      ORDER BY t.nome, d.nome
    `, [ESCOLA_ID]);
    console.log(`Combinações turma+disciplina com mais de 1 linha na matriz: ${r.rows.length}`);
    console.log(JSON.stringify(r.rows, null, 2));

    const r2 = await client.query(`
      SELECT t.nome AS turma, h.dia_semana, h.numero_aula, COUNT(*)::int AS qtd,
             array_agg(p.nome) AS professores, array_agg(d.nome) AS disciplinas
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.escola_id = $1
      GROUP BY t.nome, h.dia_semana, h.numero_aula
      HAVING COUNT(*) > 1
      ORDER BY t.nome, h.dia_semana, h.numero_aula
      LIMIT 20
    `, [ESCOLA_ID]);
    console.log(`\nSlots reais (turma+dia+aula) com mais de 1 professor ao mesmo tempo: ${r2.rows.length}`);
    console.log(JSON.stringify(r2.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
