// Corrige conflitos "professor_indisponivel": quando a grade real
// (horarios) tem uma aula agendada num slot que a disponibilidade
// marca como indisponível, isso é a disponibilidade desatualizada,
// não a grade errada -- a aula é confirmada pelo Urania. Este script
// atualiza esses registros de disponibilidade para disponivel=true.
//
// Uso:
//   node corrigir-disponibilidade-conflitos.cjs            → dry-run (ROLLBACK)
//   node corrigir-disponibilidade-conflitos.cjs --aplicar   → aplica de verdade (COMMIT)

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

    // acha conflitos: horarios reais que caem num slot marcado indisponivel
    const conflitos = await client.query(`
      SELECT DISTINCT d.id AS disponibilidade_id, p.nome AS professor_nome,
             d.dia_semana, d.horario_slot, t.turno
      FROM horarios h
      JOIN professores p ON p.id = h.professor_id
      JOIN turmas t ON t.id = h.turma_id
      JOIN disponibilidade_professores d
        ON d.professor_id = h.professor_id
       AND d.dia_semana = h.dia_semana
       AND d.horario_slot = h.numero_aula
      WHERE h.escola_id = $1 AND d.disponivel = false
    `, [ESCOLA_ID]);

    console.log(`Conflitos encontrados: ${conflitos.rows.length}`);
    for (const c of conflitos.rows) {
      console.log(`  [CORRIGE] ${c.professor_nome} — ${c.turno} dia=${c.dia_semana} slot=${c.horario_slot} -> disponivel=true`);
    }

    if (conflitos.rows.length > 0) {
      const ids = conflitos.rows.map(c => c.disponibilidade_id);
      await client.query(
        `UPDATE disponibilidade_professores SET disponivel = true WHERE id = ANY($1)`,
        [ids]
      );
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
