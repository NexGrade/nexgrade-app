const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const andre = await client.query(`SELECT id FROM professores WHERE nome = 'Andre' LIMIT 1`);
    const andreId = andre.rows[0].id;

    const slots = [
      { turma: '6TA', dia: 3, aula: 3 },
      { turma: '6TA', dia: 3, aula: 4 },
      { turma: '6TB', dia: 0, aula: 3 },
      { turma: '6TB', dia: 1, aula: 3 },
    ];

    for (const s of slots) {
      const ocupado = await client.query(
        `SELECT t.nome AS turma FROM horarios h JOIN turmas t ON t.id = h.turma_id WHERE h.professor_id = $1 AND h.dia_semana = $2 AND h.numero_aula = $3 AND t.turno = 'vespertino'`,
        [andreId, s.dia, s.aula]
      );
      console.log(`${s.turma} dia=${s.dia} aula=${s.aula} -> Andre (so vespertino) ocupado:${ocupado.rowCount>0 ? ocupado.rows[0].turma : 'nao -- LIVRE'}`);
    }

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
