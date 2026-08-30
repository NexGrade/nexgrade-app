// Diagnostico: acha professores com uma "janela" de verdade (slot vago
// entre duas aulas/HA ja ocupadas no mesmo dia) que NAO foi preenchida
// com HA, enquanto a HA dele esta em outro dia/horario que nao reduz
// janela nenhuma. Isso ajuda a confirmar a causa exata do bug antes de
// mexer no algoritmo de recalculo.
const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const [profs, horarios, disp, slots] = await Promise.all([
      client.query(`SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID]),
      client.query(`
        SELECT h.professor_id, t.turno, h.dia_semana, h.numero_aula, t.nome AS turma, d.nome AS disciplina
        FROM horarios h JOIN turmas t ON t.id = h.turma_id JOIN disciplinas d ON d.id = h.disciplina_id
        WHERE h.escola_id = $1
      `, [ESCOLA_ID]),
      client.query(`
        SELECT dp.professor_id, dp.turno, dp.dia_semana, dp.horario_slot, dp.disponivel, dp.hora_atividade_obrigatoria
        FROM disponibilidade_professores dp JOIN professores p ON p.id = dp.professor_id
        WHERE p.escola_id = $1
      `, [ESCOLA_ID]),
      client.query(`SELECT turno, numero_aula, nivel_ensino FROM horario_slots WHERE escola_id = $1 AND letivo = true`, [ESCOLA_ID]),
    ]);

    const maxAulaPorTurno = {};
    for (const s of slots.rows) {
      if (!maxAulaPorTurno[s.turno] || s.numero_aula > maxAulaPorTurno[s.turno]) maxAulaPorTurno[s.turno] = s.numero_aula;
    }

    let encontrados = 0;
    for (const prof of profs.rows) {
      const aulasDoProf = horarios.rows.filter(h => h.professor_id === prof.id);
      if (aulasDoProf.length === 0) continue;

      const porTurno = new Map();
      for (const h of aulasDoProf) {
        if (!porTurno.has(h.turno)) porTurno.set(h.turno, new Set());
        porTurno.get(h.turno).add(`${h.dia_semana}-${h.numero_aula}`);
      }

      const haDoProf = disp.rows.filter(d => d.professor_id === prof.id && d.hora_atividade_obrigatoria && d.disponivel);
      const haPorTurno = new Map();
      for (const h of haDoProf) {
        const turno = h.turno ?? "sem_turno";
        if (!haPorTurno.has(turno)) haPorTurno.set(turno, new Set());
        haPorTurno.get(turno).add(`${h.dia_semana}-${h.horario_slot}`);
      }

      for (const [turno, ocupadoAulas] of porTurno) {
        const maxAula = maxAulaPorTurno[turno] ?? 6;
        const haNesseTurno = haPorTurno.get(turno) ?? new Set();
        // ocupado TOTAL = aulas reais + HA ja marcada (pra achar janela de verdade)
        const ocupadoTotal = new Set([...ocupadoAulas, ...haNesseTurno]);

        const janelasVagas = [];
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= maxAula; aula++) {
            const chave = `${dia}-${aula}`;
            if (ocupadoTotal.has(chave)) continue;
            const antes = ocupadoTotal.has(`${dia}-${aula - 1}`);
            const depois = ocupadoTotal.has(`${dia}-${aula + 1}`);
            if (antes && depois) janelasVagas.push({ dia, aula });
          }
        }

        if (janelasVagas.length > 0 && haNesseTurno.size > 0) {
          encontrados++;
          console.log(`\n${prof.nome} (${turno}):`);
          console.log(`  Janela(s) VAGA(s) não preenchida: ${janelasVagas.map(j => `${DIAS[j.dia]} aula ${j.aula}`).join(", ")}`);
          console.log(`  HA atual marcada em: ${[...haNesseTurno].map(k => { const [d,a] = k.split("-"); return `${DIAS[d]} aula ${a}`; }).join(", ")}`);
        }
      }
    }
    console.log(`\n\nTotal de professores com janela vaga + HA em outro lugar: ${encontrados}`);
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
