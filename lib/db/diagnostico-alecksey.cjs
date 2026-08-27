const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    console.log("=== Todos os professores com 'alecksey' no nome (qualquer escola) ===");
    const todos = await client.query(
      `SELECT id, nome, email, escola_id FROM professores WHERE nome ILIKE '%alecksey%'`
    );
    console.log(JSON.stringify(todos.rows, null, 2));

    console.log("\n=== Turmas da escola (pra conferir se '1MB DES' etc existem) ===");
    const turmas = await client.query(
      `SELECT id, nome, turno FROM turmas WHERE escola_id = $1 AND nome ILIKE '%DES%' LIMIT 5`,
      [ESCOLA_ID]
    );
    console.log(JSON.stringify(turmas.rows, null, 2));

    console.log("\n=== Disciplina 'Biologia' da escola ===");
    const disc = await client.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%biologia%'`,
      [ESCOLA_ID]
    );
    console.log(JSON.stringify(disc.rows, null, 2));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
