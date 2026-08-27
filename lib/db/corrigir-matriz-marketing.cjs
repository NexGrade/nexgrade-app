// Corrige o descompasso singular/plural: a matriz curricular da 2MA ADM
// apontava pra "Estratégias de Marketing" (plural, id 1650), mas as 2
// aulas reais sincronizadas estão em "Estratégia de Marketing" (singular,
// id 2957) -- decisão confirmada anteriormente de que essa turma usa o
// nome singular mesmo. Atualiza a matriz pra apontar pro id certo.
//
// Uso:
//   node corrigir-matriz-marketing.cjs            → dry-run (ROLLBACK)
//   node corrigir-matriz-marketing.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const antes = await client.query(
      `SELECT td.id, d.nome AS disciplina_atual FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id WHERE td.id = 4498`
    );
    console.log("Antes:", JSON.stringify(antes.rows));

    await client.query(
      `UPDATE turma_disciplinas SET disciplina_id = 2957 WHERE id = 4498`
    );

    const depois = await client.query(
      `SELECT td.id, d.nome AS disciplina_atual FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id WHERE td.id = 4498`
    );
    console.log("Depois:", JSON.stringify(depois.rows));

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — rode com --aplicar.");
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
