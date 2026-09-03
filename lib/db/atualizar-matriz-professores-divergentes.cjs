// Atualiza a matriz curricular (turma_disciplinas) pra bater com a
// grade real (que reflete o PDF oficial do Urania) nos 5 combos que a
// auditoria [1] ainda apontava.
//
// Uso:
//   node atualizar-matriz-professores-divergentes.cjs            -> dry-run
//   node atualizar-matriz-professores-divergentes.cjs --aplicar   -> aplica

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");

// {turma_disciplinas.id, professor_nome_real}
const UPDATES = [
  { id: 4790, real: "Maristela de Fatima Worell Pasdiora", contexto: "7TG / Matemática" },
  { id: 4800, real: "Maristela de Fatima Worell Pasdiora", contexto: "7TH / Matemática" },
  { id: 4811, real: "Mario", contexto: "8TF / História" },
  { id: 4821, real: "Mario", contexto: "8TG / História" },
  { id: 4831, real: "Mario", contexto: "8TH / História" },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    for (const u of UPDATES) {
      const prof = await client.query(`SELECT id, nome FROM professores WHERE nome = $1`, [u.real]);
      if (prof.rowCount !== 1) {
        console.log(`  [AVISO] "${u.real}" nao resolveu pra exatamente 1 professor (${prof.rowCount}) -- pulando id=${u.id}`);
        continue;
      }
      const antes = await client.query(`SELECT professor_id FROM turma_disciplinas WHERE id = $1`, [u.id]);
      console.log(`  [ATUALIZA] ${u.contexto} (turma_disciplinas id=${u.id}): professor_id ${antes.rows[0]?.professor_id} -> ${prof.rows[0].id} (${prof.rows[0].nome})`);
      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [prof.rows[0].id, u.id]);
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\nAPLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- rode com --aplicar.");
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
