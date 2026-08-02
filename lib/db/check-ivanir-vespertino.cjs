const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    // bloqueios de Ivanir no VESPERTINO especificamente
    const bloqIvanirVesp = await client.query(
      `SELECT dia_semana, horario_slot FROM disponibilidade_professores WHERE professor_id = 638 AND disponivel = false AND turno = 'vespertino'`
    );
    console.log("Ivanir - bloqueios no VESPERTINO:", bloqIvanirVesp.rowCount);
    console.table(bloqIvanirVesp.rows);

    // onde a Ivanir ja esta ocupada no vespertino hoje (qualquer turma/disciplina)
    const ocupadaIvanirVesp = await client.query(`
      SELECT t.nome AS turma, h.dia_semana, h.numero_aula
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.professor_id = 638 AND t.turno = 'vespertino'
      ORDER BY h.dia_semana, h.numero_aula
    `);
    console.log("Ivanir - ja ocupada no VESPERTINO (outras turmas):", ocupadaIvanirVesp.rowCount);
    console.table(ocupadaIvanirVesp.rows);

    // compara com os 12 slots que a Silmara ja usa
    const slotsSilmara = [
      {turma:'6TD',dia:3,aula:5},{turma:'6TD',dia:4,aula:2},
      {turma:'6TE',dia:1,aula:4},{turma:'6TE',dia:3,aula:2},
      {turma:'6TF',dia:2,aula:2},{turma:'6TF',dia:4,aula:3},
      {turma:'6TG',dia:3,aula:4},{turma:'6TG',dia:4,aula:5},
      {turma:'6TH',dia:2,aula:1},{turma:'6TH',dia:4,aula:4},
      {turma:'6TI',dia:1,aula:5},{turma:'6TI',dia:3,aula:3},
    ];
    const bloqueadoSet = new Set(bloqIvanirVesp.rows.map(r => `${r.dia_semana}-${r.horario_slot}`));
    const ocupadoSet = new Set(ocupadaIvanirVesp.rows.map(r => `${r.dia_semana}-${r.numero_aula}`));

    console.log("=== Ivanir consegue usar o mesmo slot da Silmara? ===");
    for (const s of slotsSilmara) {
      const chave = `${s.dia}-${s.aula}`;
      const bloqueado = bloqueadoSet.has(chave);
      const ocupado = ocupadoSet.has(chave);
      console.log(`${s.turma} dia=${s.dia} aula=${s.aula} -> bloqueado:${bloqueado} ocupado:${ocupado} -> ${!bloqueado && !ocupado ? "LIVRE" : "CONFLITO"}`);
    }

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
