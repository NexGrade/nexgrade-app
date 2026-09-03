// SO LEITURA -- checa o estado ATUAL do Alecksey depois das
// resincronizacoes de hoje (matutino + vespertino), pra ver se o
// problema antigo (professor_disciplinas preenchido mas zero
// turma_disciplinas / zero aulas reais) ainda existe.
const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const prof = await client.query(
    `SELECT id, nome, email FROM professores WHERE escola_id = $1 AND nome ILIKE '%alecksey%'`,
    [ESCOLA_ID]
  );
  console.log("Professor(es) encontrado(s):", JSON.stringify(prof.rows, null, 2));
  if (prof.rowCount === 0) { await client.end(); return; }
  const profId = prof.rows[0].id;

  const profDisc = await client.query(
    `SELECT pd.id, d.nome AS disciplina FROM professor_disciplinas pd
     JOIN disciplinas d ON d.id = pd.disciplina_id WHERE pd.professor_id = $1`,
    [profId]
  );
  console.log(`\nprofessor_disciplinas (vinculos gerais): ${profDisc.rowCount}`);
  profDisc.rows.forEach(r => console.log(`  ${r.disciplina}`));

  const turmaDisc = await client.query(
    `SELECT td.id, t.nome AS turma, t.turno, d.nome AS disciplina
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     WHERE td.professor_id = $1`,
    [profId]
  );
  console.log(`\nturma_disciplinas (matriz -- por turma especifica): ${turmaDisc.rowCount}`);
  turmaDisc.rows.forEach(r => console.log(`  ${r.turma} (${r.turno}) / ${r.disciplina}`));

  const horarios = await client.query(
    `SELECT t.nome AS turma, t.turno, d.nome AS disciplina, COUNT(*)::int AS qtd
     FROM horarios h
     JOIN turmas t ON t.id = h.turma_id
     JOIN disciplinas d ON d.id = h.disciplina_id
     WHERE h.professor_id = $1
     GROUP BY t.nome, t.turno, d.nome
     ORDER BY t.turno, t.nome`,
    [profId]
  );
  console.log(`\nhorarios (aulas reais na grade): ${horarios.rowCount} combinacao(oes)`);
  let totalAulas = 0;
  horarios.rows.forEach(r => { console.log(`  ${r.turma} (${r.turno}) / ${r.disciplina}: ${r.qtd} aula(s)`); totalAulas += r.qtd; });
  console.log(`  TOTAL de aulas reais: ${totalAulas}`);

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
