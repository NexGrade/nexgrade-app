// Remove as 4 aulas de Matemática (8TF) do Alecksey -- decisão da
// coordenação de manter só Biologia/Ciências/Gestão de Resíduos (31 no total).
//
// Uso:
//   node remover-matematica-alecksey.cjs            → dry-run (ROLLBACK)
//   node remover-matematica-alecksey.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const PROFESSOR_ID = 841; // Alecksey

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const alvos = (await client.query(`
      SELECT h.id, t.nome AS turma, d.nome AS disciplina, h.dia_semana, h.numero_aula
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.professor_id = $1 AND h.escola_id = $2 AND t.nome = '8TF' AND d.nome = 'Matemática'
    `, [PROFESSOR_ID, ESCOLA_ID])).rows;

    console.log(`Encontradas: ${alvos.length}`);
    for (const a of alvos) {
      console.log(`  [REMOVE] id ${a.id} — ${a.turma} dia=${a.dia_semana} aula=${a.numero_aula} (${a.disciplina})`);
      await client.query(`DELETE FROM horarios WHERE id = $1`, [a.id]);
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
