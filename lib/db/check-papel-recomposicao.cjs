const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const nomes = { 631: "Gilberto", 644: "Juliana", 659: "Mirian" };
    for (const [id, nome] of Object.entries(nomes)) {
      const comoTitular = await client.query(
        `SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.professor_id, td.professor_apoio_id
         FROM turma_disciplinas td
         JOIN turmas t ON t.id = td.turma_id
         JOIN disciplinas d ON d.id = td.disciplina_id
         WHERE td.professor_id = $1`,
        [id]
      );
      const comoApoio = await client.query(
        `SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.professor_id, td.professor_apoio_id
         FROM turma_disciplinas td
         JOIN turmas t ON t.id = td.turma_id
         JOIN disciplinas d ON d.id = td.disciplina_id
         WHERE td.professor_apoio_id = $1`,
        [id]
      );
      console.log(`=== ${nome} (id ${id}) ===`);
      console.log("Como professor_id (titular):");
      console.table(comoTitular.rows);
      console.log("Como professor_apoio_id (apoio/dupla):");
      console.table(comoApoio.rows);
    }
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
