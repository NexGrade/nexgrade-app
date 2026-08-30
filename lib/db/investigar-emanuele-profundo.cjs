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
    console.log("Professor:", prof);

    const aulas = (await client.query(`
      SELECT t.turno, h.dia_semana, h.numero_aula, t.nome AS turma, d.nome AS disciplina
      FROM horarios h JOIN turmas t ON t.id = h.turma_id JOIN disciplinas d ON d.id = h.disciplina_id
      WHERE h.professor_id = $1 AND h.escola_id = $2 AND t.turno = 'vespertino'
      ORDER BY h.dia_semana, h.numero_aula
    `, [prof.id, ESCOLA_ID])).rows;
    console.log("\nAulas reais (vespertino):");
    aulas.forEach(a => console.log(`  ${DIAS[a.dia_semana]} aula${a.numero_aula}: ${a.turma}/${a.disciplina}`));

    const disp = (await client.query(`
      SELECT turno, dia_semana, horario_slot, disponivel, hora_atividade_obrigatoria
      FROM disponibilidade_professores
      WHERE professor_id = $1
      ORDER BY dia_semana, horario_slot
    `, [prof.id])).rows;
    console.log("\nDisponibilidade completa (todas as linhas):");
    disp.forEach(d => console.log(`  turno=${d.turno} ${DIAS[d.dia_semana]} slot${d.horario_slot}: disponivel=${d.disponivel} HA=${d.hora_atividade_obrigatoria}`));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
