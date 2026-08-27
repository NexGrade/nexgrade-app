// Cadastra a professora "Katia" (História, turmas 8MC/8MB/9MD, Manhã)
// provisoriamente -- nome/e-mail reais desconhecidos, corrigir depois.
//
// Uso:
//   node cadastrar-katia.cjs            → dry-run (ROLLBACK)
//   node cadastrar-katia.cjs --aplicar   → aplica de verdade (COMMIT)

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
      `SELECT id FROM professores WHERE email = $1 AND escola_id = $2`,
      ["katia.pendente@corrigir.nexgrade", ESCOLA_ID]
    )).rows[0];

    if (existente) {
      console.log(`Já existe: id ${existente.id}`);
    } else {
      const criada = (await client.query(
        `INSERT INTO professores (nome, email, escola_id, ativo) VALUES ($1, $2, $3, true) RETURNING id, nome, email`,
        ["Katia (nome completo pendente)", "katia.pendente@corrigir.nexgrade", ESCOLA_ID]
      )).rows[0];
      console.log("Criada:", criada);

      const [disc] = (await client.query(
        `SELECT id FROM disciplinas WHERE nome = 'História' AND escola_id = $1`,
        [ESCOLA_ID]
      )).rows;
      if (disc) {
        await client.query(
          `INSERT INTO professor_disciplinas (professor_id, disciplina_id) VALUES ($1, $2)`,
          [criada.id, disc.id]
        );
        console.log(`Vínculo criado: ${criada.nome} <-> História`);
      }
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Rode com --aplicar.");
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
