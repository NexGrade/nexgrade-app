const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const ivanirId = 638;

    const esperado = await client.query(`
      SELECT td.id, t.nome AS turma, d.nome AS disciplina,
             COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga_esperada
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE td.professor_id = $1
      ORDER BY t.nome
    `, [ivanirId]);
    console.log("=== O QUE IVANIR DEVERIA TER (turma_disciplinas) ===");
    console.table(esperado.rows);
    const totalEsperado = esperado.rows.reduce((s, r) => s + Number(r.carga_esperada), 0);
    console.log("Total esperado (aulas):", totalEsperado);

    const real = await client.query(`
      SELECT t.nome AS turma, d.nome AS disciplina, COUNT(*) AS aulas_alocadas
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.professor_id = $1
      GROUP BY t.nome, d.nome
      ORDER BY t.nome
    `, [ivanirId]);
    console.log("=== O QUE IVANIR TEM DE FATO (horarios) ===");
    console.table(real.rows);

    const ha = await client.query(`
      SELECT COUNT(*) FROM disponibilidade_professores WHERE professor_id = $1 AND hora_atividade_obrigatoria = true
    `, [ivanirId]);
    console.log("HA marcada no sistema:", ha.rows[0].count);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
