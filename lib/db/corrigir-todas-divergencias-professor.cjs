// Corrige TODAS as divergências encontradas pela auditoria: professor
// fixado na matriz curricular (turma_disciplinas.professor_id) que não
// bate com quem realmente aparece na grade sincronizada do Urania.
// Mesma causa raiz do caso do Alecksey -- provavelmente substitutos/
// licenças nunca atualizados na matriz.
//
// Uso:
//   node corrigir-todas-divergencias-professor.cjs            → dry-run (ROLLBACK)
//   node corrigir-todas-divergencias-professor.cjs --aplicar   → aplica de verdade (COMMIT)

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

    // repete a mesma logica da auditoria, mas dessa vez aplicando a correcao
    const divergencias = await client.query(`
      WITH real_por_combo AS (
        SELECT h.turma_id, h.disciplina_id, h.professor_id AS professor_real_id,
               COUNT(*) AS qtd
        FROM horarios h
        WHERE h.escola_id = $1
        GROUP BY h.turma_id, h.disciplina_id, h.professor_id
      ),
      real_dominante AS (
        SELECT DISTINCT ON (turma_id, disciplina_id)
               turma_id, disciplina_id, professor_real_id, qtd
        FROM real_por_combo
        ORDER BY turma_id, disciplina_id, qtd DESC
      )
      SELECT
        td.id AS matriz_id,
        t.nome AS turma,
        d.nome AS disciplina,
        pf.nome AS fixado_nome,
        rd.professor_real_id AS real_id,
        pr.nome AS real_nome
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      LEFT JOIN professores pf ON pf.id = td.professor_id
      LEFT JOIN real_dominante rd ON rd.turma_id = td.turma_id AND rd.disciplina_id = td.disciplina_id
      LEFT JOIN professores pr ON pr.id = rd.professor_real_id
      WHERE t.escola_id = $1
        AND td.professor_id IS NOT NULL
        AND rd.professor_real_id IS NOT NULL
        AND td.professor_id != rd.professor_real_id
    `, [ESCOLA_ID]);

    console.log(`Corrigindo ${divergencias.rows.length} divergências:\n`);

    for (const d of divergencias.rows) {
      await client.query(
        `UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`,
        [d.real_id, d.matriz_id]
      );
      console.log(`  [${d.matriz_id}] ${d.turma} / ${d.disciplina}: "${d.fixado_nome}" -> "${d.real_nome}"`);
    }

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
