const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const r = await client.query(`
      SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.professor_id,
             p.nome AS professor_fixado
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      LEFT JOIN professores p ON p.id = td.professor_id
      WHERE t.escola_id = $1 AND t.nome IN ('1MC FAR','1MD MA','1MB DES','1MA EM','1ME DOC','7TA','7TB','7TC','7TD','7TE','6TA','6TB')
        AND d.nome IN ('Biologia','Ciências','Gestão de Resíduos')
      ORDER BY t.nome
    `, [ESCOLA_ID]);
    console.log(JSON.stringify(r.rows, null, 2));

    const semFixar = r.rows.filter(x => !x.professor_id).length;
    console.log(`\nTotal: ${r.rows.length} | Sem professor_id fixado: ${semFixar}`);

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
