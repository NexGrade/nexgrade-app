// investigar-duplicatas-disciplinas.cjs
// LEITURA APENAS — nenhuma escrita no banco.
// Objetivo: para cada par de disciplinas duplicadas (mesmo codigo_sae, ids diferentes),
// listar exatamente onde cada id é referenciado: em quais turmas (via turma_disciplinas)
// e em quais itens_matriz, para decidir com segurança qual id manter e como fundir.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERRO: não encontrei .env em ${envPath}`);
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('ERRO: DATABASE_URL não encontrada no .env');
  process.exit(1);
}
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

// Pares conhecidos: [idA, idB, descricao]
const PARES = [
  [1650, 1651, 'Estratégia de Marketing (codigo_sae 5019)'],
  [1680, 2819, 'Lid Org e Ges de Pessoas (codigo_sae 5034)'],
  [1709, 2913, 'Sist de Gestão Ambiental (codigo_sae 6713)'],
];

async function getColumns(client, tableName) {
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows.map(r => r.column_name);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log('--- Colunas de itens_matriz ---');
    const imCols = await getColumns(client, 'itens_matriz');
    console.log(imCols);

    console.log('--- Colunas de turma_disciplinas ---');
    const tdCols = await getColumns(client, 'turma_disciplinas');
    console.log(tdCols);

    console.log('--- Colunas de turmas ---');
    const turmaCols = await getColumns(client, 'turmas');
    console.log(turmaCols);

    // itens_matriz NÃO tem turma_id — pertence a uma matriz_curricular_id.
    // O vínculo com turmas é indireto: turmas.matriz_curricular_id = itens_matriz.matriz_curricular_id
    // (várias turmas podem compartilhar a mesma matriz curricular).
    const turmaFkTD = tdCols.find(c => c === 'turma_id') || tdCols.find(c => c.includes('turma'));
    const nomeColTurma = turmaCols.includes('nome') ? 'nome' : turmaCols.find(c => c.includes('nome')) || turmaCols[0];
    const cargaColIM = imCols.find(c => c.includes('carga')) || null;

    console.log(`\nUsando: itens_matriz.matriz_curricular_id -> turmas.matriz_curricular_id, turma_disciplinas.${turmaFkTD}, turmas.${nomeColTurma}, carga=${cargaColIM}\n`);

    for (const [idA, idB, desc] of PARES) {
      console.log(`\n================ ${desc} ================`);

      for (const id of [idA, idB]) {
        console.log(`\n--- Disciplina id=${id} ---`);

        const discRes = await client.query(
          `SELECT id, nome, codigo_sae, sigla, carga_semanal, escola_id, created_at
           FROM disciplinas WHERE id = $1`,
          [id]
        );
        console.table(discRes.rows);

        const imSelectCols = [
          'im.id AS item_matriz_id',
          'im.matriz_curricular_id',
          'im.categoria_curricular',
          'im.grupo_disciplina',
          'im.obrigatoria',
        ];
        if (cargaColIM) imSelectCols.push(`im.${cargaColIM}`);
        const imRes = await client.query(
          `SELECT ${imSelectCols.join(', ')}
           FROM itens_matriz im
           WHERE im.disciplina_id = $1`,
          [id]
        );
        console.log(`itens_matriz referenciando id=${id}: ${imRes.rows.length}`);
        console.table(imRes.rows);

        // Para cada matriz_curricular_id encontrada, listar quais turmas a usam
        const matrizIds = [...new Set(imRes.rows.map(r => r.matriz_curricular_id).filter(Boolean))];
        if (matrizIds.length > 0) {
          const turmasRes = await client.query(
            `SELECT id, ${nomeColTurma} AS turma_nome, turno, serie, matriz_curricular_id
             FROM turmas
             WHERE matriz_curricular_id = ANY($1)`,
            [matrizIds]
          );
          console.log(`Turmas que usam essa(s) matriz_curricular_id: ${turmasRes.rows.length}`);
          console.table(turmasRes.rows);
        }

        const tdRes = await client.query(
          `SELECT td.id AS turma_disciplina_id, td.${turmaFkTD}, t.${nomeColTurma} AS turma_nome,
                  td.professor_id
           FROM turma_disciplinas td
           LEFT JOIN turmas t ON t.id = td.${turmaFkTD}
           WHERE td.disciplina_id = $1`,
          [id]
        );
        console.log(`turma_disciplinas referenciando id=${id}: ${tdRes.rows.length}`);
        console.table(tdRes.rows);
      }
    }

    console.log('\nNenhuma alteração foi feita no banco (script somente leitura).');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
