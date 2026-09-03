// SO LEITURA -- mostra, pra cada combo turma/disciplina divergente
// encontrado pela auditoria (item 1), o que a matriz (turma_disciplinas)
// tem hoje vs o que a grade real (horarios) tem, lado a lado, com os
// ids das linhas da matriz pra eu poder gerar o UPDATE certo depois.
const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TURMAS = ["9MA", "9MB", "9MC", "9MD", "9ME", "9MF"];
const DISCIPLINA = "Rec. Aprend. Matemática";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const disc = await client.query(`SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = $2`, [ESCOLA_ID, DISCIPLINA]);
  const discId = disc.rows[0]?.id;
  console.log(`disciplina_id: ${discId}`);

  for (const nomeTurma of TURMAS) {
    const turma = await client.query(`SELECT id FROM turmas WHERE escola_id = $1 AND nome = $2 AND turno = 'matutino'`, [ESCOLA_ID, nomeTurma]);
    const turmaId = turma.rows[0]?.id;
    if (!turmaId) { console.log(`\n${nomeTurma}: turma nao encontrada`); continue; }

    const matriz = await client.query(
      `SELECT td.id, td.professor_id, p.nome AS professor_nome, td.carga_horaria_semanal_override
       FROM turma_disciplinas td LEFT JOIN professores p ON p.id = td.professor_id
       WHERE td.turma_id = $1 AND td.disciplina_id = $2 ORDER BY td.id`,
      [turmaId, discId]
    );
    const real = await client.query(
      `SELECT DISTINCT h.professor_id, p.nome AS professor_nome
       FROM horarios h JOIN professores p ON p.id = h.professor_id
       WHERE h.turma_id = $1 AND h.disciplina_id = $2`,
      [turmaId, discId]
    );

    console.log(`\n${nomeTurma}:`);
    console.log(`  matriz (turma_disciplinas): ${matriz.rows.map(r => `[id=${r.id}] ${r.professor_nome} (carga=${r.carga_horaria_semanal_override})`).join(" | ")}`);
    console.log(`  grade real (horarios):      ${real.rows.map(r => r.professor_nome).join(" | ")}`);
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
