// SO LEITURA -- mostra matriz vs grade real pros 5 combos divergentes
// restantes, com os ids da matriz, pra eu montar o UPDATE certo.
const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const COMBOS = [
  { turma: "7TG", disciplina: "Matemática" },
  { turma: "7TH", disciplina: "Matemática" },
  { turma: "8TF", disciplina: "História" },
  { turma: "8TG", disciplina: "História" },
  { turma: "8TH", disciplina: "História" },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const c of COMBOS) {
    const turma = await client.query(`SELECT id, turno FROM turmas WHERE escola_id=$1 AND nome=$2`, [ESCOLA_ID, c.turma]);
    const disc = await client.query(`SELECT id FROM disciplinas WHERE escola_id=$1 AND nome=$2`, [ESCOLA_ID, c.disciplina]);
    const turmaId = turma.rows[0]?.id;
    const discId = disc.rows[0]?.id;
    if (!turmaId || !discId) { console.log(`${c.turma}/${c.disciplina}: turma ou disciplina nao encontrada`); continue; }

    const matriz = await client.query(
      `SELECT td.id, td.professor_id, p.nome FROM turma_disciplinas td LEFT JOIN professores p ON p.id = td.professor_id
       WHERE td.turma_id=$1 AND td.disciplina_id=$2`, [turmaId, discId]
    );
    const real = await client.query(
      `SELECT DISTINCT h.professor_id, p.nome FROM horarios h JOIN professores p ON p.id = h.professor_id
       WHERE h.turma_id=$1 AND h.disciplina_id=$2`, [turmaId, discId]
    );

    console.log(`\n${c.turma} / ${c.disciplina} (turno ${turma.rows[0].turno}):`);
    console.log(`  matriz: ${matriz.rows.map(r => `[id=${r.id}] ${r.nome}`).join(" | ")}`);
    console.log(`  real:   ${real.rows.map(r => r.nome).join(" | ")}`);
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
