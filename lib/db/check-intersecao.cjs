const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const ivanirId = 638, silmaraId = 672;

    const bloqIvanir = await client.query(
      `SELECT dia_semana, horario_slot, turno, hora_atividade_obrigatoria FROM disponibilidade_professores WHERE professor_id = $1 AND disponivel = false`,
      [ivanirId]
    );
    const bloqSilmara = await client.query(
      `SELECT dia_semana, horario_slot, turno, hora_atividade_obrigatoria FROM disponibilidade_professores WHERE professor_id = $1 AND disponivel = false`,
      [silmaraId]
    );

    console.log("=== Ivanir bloqueada ===");
    console.table(bloqIvanir.rows);
    console.log("=== Silmara bloqueada ===");
    console.table(bloqSilmara.rows);

    // calcula a intersecao de slots livres (matutino, 5 dias x 5 aulas)
    const bloqueadoIvanirSet = new Set(bloqIvanir.rows.map(r => `${r.dia_semana}-${r.horario_slot}`));
    const bloqueadoSilmaraSet = new Set(bloqSilmara.rows.map(r => `${r.dia_semana}-${r.horario_slot}`));

    let livresEmComum = 0;
    const detalhes = [];
    for (let dia = 0; dia <= 4; dia++) {
      for (let aula = 1; aula <= 5; aula++) {
        const chave = `${dia}-${aula}`;
        const ivanirLivre = !bloqueadoIvanirSet.has(chave);
        const silmaraLivre = !bloqueadoSilmaraSet.has(chave);
        if (ivanirLivre && silmaraLivre) {
          livresEmComum++;
          detalhes.push({ dia, aula });
        }
      }
    }
    console.log("Slots livres em comum (so por disponibilidade, sem contar ocupacao real):", livresEmComum);
    console.table(detalhes);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
