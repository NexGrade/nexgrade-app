const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const nomes = await client.query(`SELECT id, nome FROM professores WHERE nome IN ('Pedro','Lisiane')`);
    console.table(nomes.rows);
    const pedroId = nomes.rows.find(r => r.nome === 'Pedro').id;
    const lisianeId = nomes.rows.find(r => r.nome === 'Lisiane').id;
    const slots = [
      { turma: '6TA', parceiro: 'Pedro', id: pedroId, dia: 3, aula: 2 },
      { turma: '6TA', parceiro: 'Pedro', id: pedroId, dia: 3, aula: 4 },
      { turma: '6TB', parceiro: 'Lisiane', id: lisianeId, dia: 0, aula: 3 },
      { turma: '6TB', parceiro: 'Lisiane', id: lisianeId, dia: 1, aula: 3 },
    ];
    for (const s of slots) {
      const bloqueado = await client.query(
        `SELECT 1 FROM disponibilidade_professores WHERE professor_id = $1 AND disponivel = false AND turno = 'vespertino' AND dia_semana = $2 AND horario_slot = $3`,
        [s.id, s.dia, s.aula]
      );
      const ocupado = await client.query(
        `SELECT t.nome AS turma FROM horarios h JOIN turmas t ON t.id = h.turma_id WHERE h.professor_id = $1 AND h.dia_semana = $2 AND h.numero_aula = $3`,
        [s.id, s.dia, s.aula]
      );
      console.log(`${s.turma} dia=${s.dia} aula=${s.aula} parceiro=${s.parceiro} -> bloqueado:${bloqueado.rowCount>0} ocupado:${ocupado.rowCount>0 ? ocupado.rows[0].turma : 'nao'}`);
    }
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
