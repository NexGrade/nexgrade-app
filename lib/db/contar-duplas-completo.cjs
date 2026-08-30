const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT t.nome AS turma, t.turno, h.dia_semana, h.numero_aula, COUNT(*)::int AS qtd,
             array_agg(DISTINCT p.nome) AS professores,
             array_agg(DISTINCT d.nome) AS disciplinas
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.escola_id = $1
      GROUP BY t.nome, t.turno, h.dia_semana, h.numero_aula
      HAVING COUNT(*) > 1
      ORDER BY t.nome, h.dia_semana, h.numero_aula
    `, [ESCOLA_ID]);
    console.log(`TOTAL de slots com 2+ professores ao mesmo tempo (mesma turma): ${r.rows.length}\n`);
    r.rows.forEach(row => {
      console.log(`${row.turma} (${row.turno}) dia=${row.dia_semana} aula=${row.numero_aula}: ${row.professores.join(" + ")} [${row.disciplinas.join(", ")}]`);
    });

    // agrupa por (turma, disciplina, par de professores) pra ver quantos PARES unicos existem
    const paresUnicos = new Map();
    for (const row of r.rows) {
      const key = `${row.turma}|${[...row.professores].sort().join("+")}|${row.disciplinas.join(",")}`;
      paresUnicos.set(key, (paresUnicos.get(key) || 0) + 1);
    }
    console.log(`\n\nPares únicos (turma + dupla de professores + disciplina): ${paresUnicos.size}`);
    for (const [key, qtd] of paresUnicos) {
      console.log(`  ${key} — ${qtd} aula(s)/semana`);
    }

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
