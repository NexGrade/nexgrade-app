const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const prof = (await client.query(
      `SELECT id, nome FROM professores WHERE nome = 'Franciele de Assis Timotio' AND escola_id = $1`,
      [ESCOLA_ID]
    )).rows[0];

    const aulas = (await client.query(`
      SELECT t.turno, h.dia_semana, h.numero_aula
      FROM horarios h JOIN turmas t ON t.id = h.turma_id
      WHERE h.professor_id = $1 AND h.escola_id = $2
    `, [prof.id, ESCOLA_ID])).rows;
    console.log(`Total de aulas (todos os turnos): ${aulas.length}`);
    const porTurno = {};
    aulas.forEach(a => { porTurno[a.turno] = (porTurno[a.turno]||0)+1; });
    console.log("Por turno:", porTurno);

    const disp = (await client.query(`
      SELECT turno, dia_semana, horario_slot, hora_atividade_obrigatoria
      FROM disponibilidade_professores WHERE professor_id = $1 AND hora_atividade_obrigatoria = true
      ORDER BY turno, dia_semana, horario_slot
    `, [prof.id])).rows;
    console.log(`\nTotal de HA marcada: ${disp.length}`);
    disp.forEach(d => console.log(`  ${d.turno} ${DIAS[d.dia_semana]} slot${d.horario_slot}`));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
