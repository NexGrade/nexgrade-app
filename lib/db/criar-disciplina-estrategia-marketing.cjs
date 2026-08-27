// Cria a disciplina "Estratégia de Marketing" (singular) no catálogo, usada
// especificamente pela turma 2MA ADM (distinta de "Estratégias de Marketing",
// plural, já existente e usada por outras turmas). Escola: C.E. Prof. Mário
// B.T. Braga (org_3HCMsuYeAwkggR1dxXNzEdzNaX8).
//
// Uso:
//   node criar-disciplina-estrategia-marketing.cjs            → dry-run (ROLLBACK)
//   node criar-disciplina-estrategia-marketing.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const existente = (await client.query(
      `SELECT id, nome FROM disciplinas WHERE nome = 'Estratégia de Marketing' AND escola_id = $1`,
      [ESCOLA_ID]
    )).rows;
    if (existente.length > 0) {
      console.log("Já existe:", existente);
    } else {
      const criada = (await client.query(
        `INSERT INTO disciplinas (nome, escola_id, sigla) VALUES ('Estratégia de Marketing', $1, 'E.MARK') RETURNING id, nome, escola_id, sigla`,
        [ESCOLA_ID]
      )).rows;
      console.log("Criada:", criada);
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Rode com --aplicar para confirmar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
