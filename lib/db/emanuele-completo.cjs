const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const prof = (await client.query(
      `SELECT id, nome FROM professores WHERE nome = 'Emanuele' AND escola_id = $1`,
      [ESCOLA_ID]
    )).rows[0];

    const aulas = (await client.query(`
      SELECT t.turno, h.dia_semana, h.numero_aula, t.nome AS turma, d.nome AS disciplina
      FROM horarios h JOIN turmas t ON t.id = h.turma_id JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.professor_id = $1 AND h.escola_id = $2
      ORDER BY t.turno, h.dia_semana, h.numero_aula
    `, [prof.id, ESCOLA_ID])).rows;
    console.log("TODAS as aulas reais:");
    aulas.forEach(a => console.log(`  [${a.turno}] ${DIAS[a.dia_semana]} aula${a.numero_aula}: ${a.turma}/${a.disciplina}`));
    console.log(`\nTotal de aulas (todos os turnos): ${aulas.length}`);

    const maxAulaPorTurno = (await client.query(`
      SELECT turno, MAX(numero_aula)::int AS max_aula FROM horario_slots
      WHERE escola_id = $1 AND letivo = true GROUP BY turno
    `, [ESCOLA_ID])).rows;
    console.log("\nMax aula por turno:", maxAulaPorTurno);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
