// SO LEITURA -- verifica se a disciplina duplicada "Estrategias de
// Marketing" (id 1650) esta referenciada em algum lugar antes de
// decidir se da pra excluir com seguranca.
const { Client } = require("pg");
const DISCIPLINA_ID = 1650;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const turmaDisc = await client.query(
    `SELECT td.id, t.nome AS turma, t.escola_id
     FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id
     WHERE td.disciplina_id = $1`,
    [DISCIPLINA_ID]
  );
  console.log(`turma_disciplinas referenciando id ${DISCIPLINA_ID}: ${turmaDisc.rowCount}`);
  turmaDisc.rows.forEach(r => console.log("  ", r));

  const horarios = await client.query(
    `SELECT COUNT(*)::int AS total FROM horarios WHERE disciplina_id = $1`,
    [DISCIPLINA_ID]
  );
  console.log(`horarios referenciando id ${DISCIPLINA_ID}: ${horarios.rows[0].total}`);

  const disc = await client.query(`SELECT id, nome, escola_id FROM disciplinas WHERE id = $1`, [DISCIPLINA_ID]);
  console.log("registro da disciplina:", disc.rows[0]);

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
