// Restaura horarios, disponibilidade_professores e turma_disciplinas
// a partir de um backup criado pelo backup-estado-limpo.cjs. SEMPRE
// dry-run por padrao -- só aplica com --aplicar.
//
// Uso:
//   node restaurar-backup.cjs 20260828_2209                -> dry-run
//   node restaurar-backup.cjs 20260828_2209 --aplicar        -> aplica

const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const TIMESTAMP = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");

if (!TIMESTAMP) {
  console.error("Uso: node restaurar-backup.cjs <TIMESTAMP> [--aplicar]");
  console.error("Exemplo: node restaurar-backup.cjs 20260828_2209");
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const nomeHorarios = `horarios_backup_${TIMESTAMP}`;
  const nomeDisp = `disponibilidade_backup_${TIMESTAMP}`;
  const nomeMatriz = `turma_disciplinas_backup_${TIMESTAMP}`;

  try {
    // confirma que as 3 tabelas de backup existem antes de mexer em qualquer coisa
    for (const nome of [nomeHorarios, nomeDisp, nomeMatriz]) {
      const existe = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS existe`,
        [nome]
      );
      if (!existe.rows[0].existe) {
        console.error(`ERRO: tabela de backup "${nome}" não existe. Confira o timestamp.`);
        process.exit(1);
      }
    }

    await client.query("BEGIN");

    const atualHorarios = await client.query(`SELECT COUNT(*)::int AS total FROM horarios WHERE escola_id = $1`, [ESCOLA_ID]);
    const backupHorarios = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeHorarios}`);
    console.log(`horarios: atual=${atualHorarios.rows[0].total} -> backup=${backupHorarios.rows[0].total}`);

    await client.query(`DELETE FROM horarios WHERE escola_id = $1`, [ESCOLA_ID]);
    await client.query(`INSERT INTO horarios SELECT * FROM ${nomeHorarios}`);

    const idsProfessores = await client.query(`SELECT id FROM professores WHERE escola_id = $1`, [ESCOLA_ID]);
    const listaIds = idsProfessores.rows.map((r) => r.id);
    const atualDisp = await client.query(`SELECT COUNT(*)::int AS total FROM disponibilidade_professores WHERE professor_id = ANY($1)`, [listaIds]);
    const backupDisp = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeDisp}`);
    console.log(`disponibilidade: atual=${atualDisp.rows[0].total} -> backup=${backupDisp.rows[0].total}`);

    await client.query(`DELETE FROM disponibilidade_professores WHERE professor_id = ANY($1)`, [listaIds]);
    await client.query(`INSERT INTO disponibilidade_professores SELECT * FROM ${nomeDisp}`);

    const idsTurmas = await client.query(`SELECT id FROM turmas WHERE escola_id = $1`, [ESCOLA_ID]);
    const listaTurmaIds = idsTurmas.rows.map((r) => r.id);
    const atualMatriz = await client.query(`SELECT COUNT(*)::int AS total FROM turma_disciplinas WHERE turma_id = ANY($1)`, [listaTurmaIds]);
    const backupMatriz = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeMatriz}`);
    console.log(`turma_disciplinas: atual=${atualMatriz.rows[0].total} -> backup=${backupMatriz.rows[0].total}`);

    await client.query(`DELETE FROM turma_disciplinas WHERE turma_id = ANY($1)`, [listaTurmaIds]);
    await client.query(`INSERT INTO turma_disciplinas SELECT * FROM ${nomeMatriz}`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ RESTAURADO com sucesso.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — rode com --aplicar pra restaurar de verdade.");
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
