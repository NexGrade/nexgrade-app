// Corrige a numeração das aulas do NOTURNO: minha extração contou o
// horário vago (18:00) como "aula 1", empurrando tudo uma casa (aula
// real de 22:10 virou "6" em vez de "5"). O esquema já configurado no
// banco usa 0=vago(18:00, não letivo), 1..5=aulas reais(18:45..22:10).
// Este script subtrai 1 de cada numero_aula das linhas de horarios do
// noturno para essa escola.
//
// Uso:
//   node corrigir-numeracao-noturno.cjs            → dry-run (ROLLBACK)
//   node corrigir-numeracao-noturno.cjs --aplicar   → aplica de verdade (COMMIT)

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

    // conferencia antes: quantas linhas existem por numero_aula no noturno
    const antes = await client.query(`
      SELECT numero_aula, COUNT(*)::int AS total
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = 'noturno'
      GROUP BY numero_aula ORDER BY numero_aula
    `, [ESCOLA_ID]);
    console.log("Antes da correção (por número de aula):");
    console.log(JSON.stringify(antes.rows, null, 2));

    const numeroAula1 = antes.rows.find(r => r.numero_aula === 1);
    if (numeroAula1) {
      console.log(`\n⚠ Existem ${numeroAula1.total} linha(s) com numero_aula=1 (deveriam ser vagas/inexistentes).`);
      console.log("Essas ficariam com numero_aula=0 depois da correção -- confira se faz sentido antes de aplicar.");
    }

    const resultado = await client.query(`
      UPDATE horarios h
      SET numero_aula = numero_aula - 1
      FROM turmas t
      WHERE h.turma_id = t.id AND h.escola_id = $1 AND t.turno = 'noturno'
      RETURNING h.id
    `, [ESCOLA_ID]);
    console.log(`\nLinhas atualizadas: ${resultado.rowCount}`);

    const depois = await client.query(`
      SELECT numero_aula, COUNT(*)::int AS total
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1 AND t.turno = 'noturno'
      GROUP BY numero_aula ORDER BY numero_aula
    `, [ESCOLA_ID]);
    console.log("\nDepois da correção (por número de aula):");
    console.log(JSON.stringify(depois.rows, null, 2));

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Revise e rode com --aplicar.");
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
