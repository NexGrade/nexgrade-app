const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    console.log("=== Disciplinas 'Estrat...Marketing' no catálogo ===");
    const discs = await client.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%strat%marketing%'`,
      [ESCOLA_ID]
    );
    console.log(JSON.stringify(discs.rows, null, 2));

    console.log("\n=== Aulas reais de 2MA ADM com essas disciplinas ===");
    const aulas = await client.query(`
      SELECT h.id, d.id AS disciplina_id, d.nome AS disciplina_nome, h.dia_semana, h.numero_aula
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE t.nome = '2MA ADM' AND h.escola_id = $1 AND d.nome ILIKE '%strat%marketing%'
    `, [ESCOLA_ID]);
    console.log(JSON.stringify(aulas.rows, null, 2));

    console.log("\n=== O que a matriz curricular da 2MA ADM espera ===");
    const matriz = await client.query(`
      SELECT td.id, d.id AS disciplina_id, d.nome AS disciplina_nome, td.carga_horaria_semanal_override
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE t.nome = '2MA ADM' AND t.escola_id = $1 AND d.nome ILIKE '%strat%marketing%'
    `, [ESCOLA_ID]);
    console.log(JSON.stringify(matriz.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
