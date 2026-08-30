const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    // pra cada (turma, disciplina) na matriz curricular com professor fixado,
    // acha qual professor de fato aparece na grade real (horarios) pra essa
    // combinacao, e quantas vezes -- se o fixado nao bate com o mais comum
    // na grade real, e um caso suspeito de "professor antigo/substituto".
    const r = await client.query(`
      WITH real_por_combo AS (
        SELECT h.turma_id, h.disciplina_id, h.professor_id AS professor_real_id,
               COUNT(*) AS qtd
        FROM horarios h
        WHERE h.escola_id = $1
        GROUP BY h.turma_id, h.disciplina_id, h.professor_id
      ),
      real_dominante AS (
        SELECT DISTINCT ON (turma_id, disciplina_id)
               turma_id, disciplina_id, professor_real_id, qtd
        FROM real_por_combo
        ORDER BY turma_id, disciplina_id, qtd DESC
      )
      SELECT
        td.id AS matriz_id,
        t.nome AS turma,
        d.nome AS disciplina,
        td.professor_id AS fixado_id,
        pf.nome AS fixado_nome,
        rd.professor_real_id AS real_id,
        pr.nome AS real_nome,
        rd.qtd AS aulas_reais_desse_professor
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      LEFT JOIN professores pf ON pf.id = td.professor_id
      LEFT JOIN real_dominante rd ON rd.turma_id = td.turma_id AND rd.disciplina_id = td.disciplina_id
      LEFT JOIN professores pr ON pr.id = rd.professor_real_id
      WHERE t.escola_id = $1
        AND td.professor_id IS NOT NULL
        AND rd.professor_real_id IS NOT NULL
        AND td.professor_id != rd.professor_real_id
      ORDER BY t.nome, d.nome
    `, [ESCOLA_ID]);

    console.log(`Total de divergências encontradas: ${r.rows.length}\n`);
    r.rows.forEach(row => {
      console.log(`[${row.matriz_id}] ${row.turma} / ${row.disciplina}: fixado="${row.fixado_nome}" MAS grade real tem "${row.real_nome}" (${row.aulas_reais_desse_professor} aulas)`);
    });

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
