// Popula professor_disciplinas com base na grade oficial já sincronizada
// (tabela horarios) -- vincula cada professor às disciplinas que ele
// realmente leciona, segundo os horários reais (Manhã+Tarde+Noite).
// Não duplica vínculos já existentes.
//
// Uso:
//   node vincular-professor-disciplinas.cjs            → dry-run (ROLLBACK)
//   node vincular-professor-disciplinas.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mário B.T. Braga

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const pares = (await client.query(`
      SELECT DISTINCT h.professor_id, h.disciplina_id, p.nome AS professor_nome, d.nome AS disciplina_nome
      FROM horarios h
      JOIN professores p ON p.id = h.professor_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.escola_id = $1
      ORDER BY p.nome, d.nome;
    `, [ESCOLA_ID])).rows;

    console.log(`Combinações professor+disciplina encontradas na grade: ${pares.length}\n`);

    let criados = 0, jaExistiam = 0;
    for (const par of pares) {
      const existe = (await client.query(
        `SELECT 1 FROM professor_disciplinas WHERE professor_id = $1 AND disciplina_id = $2`,
        [par.professor_id, par.disciplina_id]
      )).rows.length > 0;

      if (existe) {
        jaExistiam++;
        continue;
      }

      await client.query(
        `INSERT INTO professor_disciplinas (professor_id, disciplina_id) VALUES ($1, $2)`,
        [par.professor_id, par.disciplina_id]
      );
      criados++;
      console.log(`  [novo] ${par.professor_nome} <-> ${par.disciplina_nome}`);
    }

    console.log(`\nTotal: ${criados} vínculo(s) novo(s), ${jaExistiam} já existente(s) (pulados).`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Revise a lista acima e rode com --aplicar.");
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
