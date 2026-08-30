// Corrige o professor_id fixado em turma_disciplinas pras 13
// combinações turma+disciplina que são reais do Alecksey -- estavam
// apontando pra quem cobriu ele durante a licença (nunca atualizado
// quando ele voltou). Isso é a causa raiz de qualquer geração
// automática sempre colocar outra pessoa no lugar dele.
//
// Uso:
//   node corrigir-professor-fixado-alecksey.cjs            → dry-run (ROLLBACK)
//   node corrigir-professor-fixado-alecksey.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ALECKSEY_ID = 841;

const IDS_TURMA_DISCIPLINAS = [4454, 4522, 4561, 4593, 4597, 4624, 5320, 4648, 4736, 4746, 4756, 4766, 4776];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const antes = await client.query(`
      SELECT td.id, t.nome AS turma, d.nome AS disciplina, p.nome AS professor_atual
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      LEFT JOIN professores p ON p.id = td.professor_id
      WHERE td.id = ANY($1)
      ORDER BY t.nome
    `, [IDS_TURMA_DISCIPLINAS]);
    console.log("Antes:");
    antes.rows.forEach(r => console.log(`  [${r.id}] ${r.turma} / ${r.disciplina}: ${r.professor_atual}`));

    await client.query(
      `UPDATE turma_disciplinas SET professor_id = $1 WHERE id = ANY($2)`,
      [ALECKSEY_ID, IDS_TURMA_DISCIPLINAS]
    );

    const depois = await client.query(`
      SELECT td.id, t.nome AS turma, d.nome AS disciplina, p.nome AS professor_atual
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      LEFT JOIN professores p ON p.id = td.professor_id
      WHERE td.id = ANY($1)
      ORDER BY t.nome
    `, [IDS_TURMA_DISCIPLINAS]);
    console.log("\nDepois:");
    depois.rows.forEach(r => console.log(`  [${r.id}] ${r.turma} / ${r.disciplina}: ${r.professor_atual}`));

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
