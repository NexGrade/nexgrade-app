// Corrige um bug da extracao do PDF por turma: celulas de dupla
// docencia aparecem no PDF como "JULIANA E JULIO" / "MATHEUS E JULIO"
// (um texto so), e o parser usado no ressincronizar-matutino-completo
// tratou isso como um unico professor, perdendo o Julio Cesar dos
// Santos. A matriz curricular (turma_disciplinas) ja estava certa --
// so faltou inserir a segunda linha da dupla nos 12 slots abaixo.
//
// Uso:
//   node corrigir-dupla-recaprend-matematica-9ano.cjs            -> dry-run
//   node corrigir-dupla-recaprend-matematica-9ano.cjs --aplicar   -> aplica

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DISCIPLINA_NOME = "Rec. Aprend. Matemática";
const PROFESSOR_FALTANTE = "Julio Cesar dos Santos";

// {turma, dia, numeroAula} -- os 12 slots onde a dupla ficou incompleta
const SLOTS = [
  { turma: "9MA", dia: 3, numeroAula: 3 },
  { turma: "9MA", dia: 1, numeroAula: 5 },
  { turma: "9MB", dia: 3, numeroAula: 1 },
  { turma: "9MB", dia: 1, numeroAula: 3 },
  { turma: "9MC", dia: 1, numeroAula: 2 },
  { turma: "9MC", dia: 3, numeroAula: 4 },
  { turma: "9MD", dia: 1, numeroAula: 4 },
  { turma: "9MD", dia: 3, numeroAula: 5 },
  { turma: "9ME", dia: 2, numeroAula: 2 },
  { turma: "9ME", dia: 0, numeroAula: 3 },
  { turma: "9MF", dia: 0, numeroAula: 1 },
  { turma: "9MF", dia: 1, numeroAula: 1 },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    const disc = await client.query(`SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = $2`, [ESCOLA_ID, DISCIPLINA_NOME]);
    const discId = disc.rows[0]?.id;
    const prof = await client.query(`SELECT id FROM professores WHERE escola_id = $1 AND nome = $2`, [ESCOLA_ID, PROFESSOR_FALTANTE]);
    const profId = prof.rows[0]?.id;
    console.log(`disciplina_id=${discId}, professor_id=${profId}`);
    if (!discId || !profId) throw new Error("disciplina ou professor nao encontrado -- abortando");

    let inseridos = 0;
    for (const s of SLOTS) {
      const turma = await client.query(`SELECT id FROM turmas WHERE escola_id = $1 AND nome = $2 AND turno = 'matutino'`, [ESCOLA_ID, s.turma]);
      const turmaId = turma.rows[0]?.id;
      if (!turmaId) { console.log(`  [AVISO] turma ${s.turma} nao encontrada`); continue; }

      const jaExiste = await client.query(
        `SELECT id FROM horarios WHERE turma_id = $1 AND disciplina_id = $2 AND professor_id = $3 AND dia_semana = $4 AND numero_aula = $5`,
        [turmaId, discId, profId, s.dia, s.numeroAula]
      );
      if (jaExiste.rowCount > 0) {
        console.log(`  [JA EXISTE] ${s.turma} dia=${s.dia} aula=${s.numeroAula} -- pulando`);
        continue;
      }
      console.log(`  [INSERE] ${s.turma} dia=${s.dia} aula=${s.numeroAula} -> ${PROFESSOR_FALTANTE}`);
      await client.query(
        `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ESCOLA_ID, turmaId, discId, profId, s.dia, s.numeroAula]
      );
      inseridos++;
    }
    console.log(`\nTotal inserido: ${inseridos} de ${SLOTS.length}`);

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
