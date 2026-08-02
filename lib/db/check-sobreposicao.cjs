const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const ivanirId = 638, silmaraId = 672;

    // quantos slots livres cada uma tem (matutino, 5 aulas/dia x 5 dias = 25 possiveis)
    const bloqueadosIvanir = await client.query(
      `SELECT dia_semana, horario_slot FROM disponibilidade_professores WHERE professor_id = $1 AND disponivel = false`,
      [ivanirId]
    );
    const bloqueadosSilmara = await client.query(
      `SELECT dia_semana, horario_slot FROM disponibilidade_professores WHERE professor_id = $1 AND disponivel = false`,
      [silmaraId]
    );
    console.log("Ivanir - slots bloqueados (disponibilidade):", bloqueadosIvanir.rowCount);
    console.log("Silmara - slots bloqueados (disponibilidade):", bloqueadosSilmara.rowCount);

    // quantas aulas cada uma ja tem ocupadas em horarios (turno matutino, considerando turno da turma)
    const ocupadasIvanir = await client.query(
      `SELECT h.dia_semana, h.numero_aula, t.nome AS turma FROM horarios h JOIN turmas t ON t.id = h.turma_id WHERE h.professor_id = $1`,
      [ivanirId]
    );
    const ocupadasSilmara = await client.query(
      `SELECT h.dia_semana, h.numero_aula, t.nome AS turma FROM horarios h JOIN turmas t ON t.id = h.turma_id WHERE h.professor_id = $1`,
      [silmaraId]
    );
    console.log("Ivanir - aulas ja ocupadas (horarios):", ocupadasIvanir.rowCount);
    console.log("Silmara - aulas ja ocupadas (horarios):", ocupadasSilmara.rowCount);
    console.table(ocupadasSilmara.rows);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
