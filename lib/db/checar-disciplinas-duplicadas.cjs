// SO LEITURA -- verifica se as disciplinas "sem codigo_sae" na grade
// tem uma linha DUPLICADA (mesmo nome) que TEM codigo_sae preenchido --
// sinal de que a grade referencia o id errado.
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const r = await client.query(
    `SELECT nome, COUNT(*) AS qtd,
            array_agg(id ORDER BY id) AS ids,
            array_agg(codigo_sae ORDER BY id) AS codigos_sae
     FROM disciplinas
     WHERE escola_id = $1
     GROUP BY nome
     HAVING COUNT(*) > 1
     ORDER BY nome`,
    [ESCOLA_ID]
  );

  console.log(`Disciplinas com nome DUPLICADO (mais de 1 linha): ${r.rows.length}\n`);
  for (const row of r.rows) {
    console.log(`  "${row.nome}" -> ${row.qtd} linhas | ids=${row.ids} | codigo_sae=${row.codigos_sae}`);
  }

  // agora verifica quais dessas duplicatas estao sendo USADAS na grade
  // (horarios) e se o id usado e o que TEM codigo_sae ou o que NAO tem
  console.log(`\n--- Verificando qual id cada disciplina duplicada usa na grade (horarios) ---`);
  for (const row of r.rows) {
    const usoR = await client.query(
      `SELECT h.disciplina_id, COUNT(*) AS qtd
       FROM horarios h
       JOIN turmas t ON t.id = h.turma_id
       WHERE t.escola_id = $1 AND h.disciplina_id = ANY($2)
       GROUP BY h.disciplina_id`,
      [ESCOLA_ID, row.ids]
    );
    console.log(`  "${row.nome}":`);
    for (const u of usoR.rows) {
      const idx = row.ids.indexOf(u.disciplina_id);
      const temCodigo = row.codigos_sae[idx];
      console.log(`    id=${u.disciplina_id} usado em ${u.qtd} aulas | codigo_sae=${temCodigo ?? "(vazio)"}`);
    }
  }

  await client.end();
}
main().catch((err) => { console.error(err); process.exit(1); });
