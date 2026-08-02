const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const escolaId = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

    // acha professores ligados a disciplinas de "Recomposicao"
    const profs = await client.query(`
      SELECT DISTINCT p.id, p.nome, d.nome AS disciplina
      FROM professores p
      JOIN professor_disciplinas pd ON pd.professor_id = p.id
      JOIN disciplinas d ON d.id = pd.disciplina_id
      WHERE p.escola_id = $1 AND d.nome ILIKE '%Recomposi%'
      ORDER BY d.nome, p.nome
    `, [escolaId]);
    console.log("=== PROFESSORES DE RECOMPOSICAO ===");
    console.table(profs.rows);

    // pra cada um, conta quantas linhas tem na tabela horarios
    for (const p of profs.rows) {
      const cnt = await client.query(
        `SELECT COUNT(*) FROM horarios WHERE professor_id = $1`,
        [p.id]
      );
      console.log(`${p.nome} (${p.disciplina}): ${cnt.rows[0].count} linha(s) em horarios`);
    }

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
