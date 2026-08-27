// investigar-matriz-curricular.cjs
// LEITURA APENAS — nenhuma escrita no banco.

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

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const ARLINDA_ORG_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';

async function getColumns(client, tableName) {
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log('=== PARTE A: disciplinas_catalogo (tabela pré-existente, investigar antes de tudo) ===');
    const dcCols = await getColumns(client, 'disciplinas_catalogo');
    console.log('Colunas de disciplinas_catalogo:');
    console.table(dcCols);

    const dcCountRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`Total de linhas em disciplinas_catalogo: ${dcCountRes.rows[0].count}`);

    const dcSampleRes = await client.query(`SELECT * FROM disciplinas_catalogo LIMIT 10`);
    console.log('Amostra:');
    console.table(dcSampleRes.rows);

    // Ver se algum código no backend referencia essa tabela (não dá pra grep daqui,
    // mas ao menos confirmamos o schema/dados)

    console.log('\n\n=== PARTE B: matrizes_curriculares ===');
    const mcCols = await getColumns(client, 'matrizes_curriculares');
    console.log('Colunas de matrizes_curriculares:');
    console.table(mcCols);

    console.log('\n--- Matrizes curriculares de Arlinda (caso funcional, referência) ---');
    const arlindaMatrizesRes = await client.query(
      `SELECT * FROM matrizes_curriculares WHERE escola_id = $1 LIMIT 20`,
      [ARLINDA_ORG_ID]
    );
    console.table(arlindaMatrizesRes.rows);
    const arlindaCountRes = await client.query(
      `SELECT COUNT(*) FROM matrizes_curriculares WHERE escola_id = $1`, [ARLINDA_ORG_ID]
    );
    console.log(`Total real de matrizes de Arlinda: ${arlindaCountRes.rows[0].count}`);

    console.log('\n--- Como as turmas de Arlinda se relacionam com matrizes_curriculares ---');
    const arlindaTurmasRes = await client.query(
      `SELECT id, nome, serie, turno, matriz_curricular_id FROM turmas WHERE escola_id = $1 ORDER BY matriz_curricular_id`,
      [ARLINDA_ORG_ID]
    );
    console.table(arlindaTurmasRes.rows);

    console.log('\n--- Matrizes curriculares de Mário Braga (se houver) ---');
    const mbMatrizesRes = await client.query(
      `SELECT * FROM matrizes_curriculares WHERE escola_id = $1 LIMIT 20`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(mbMatrizesRes.rows);
    const mbCountRes = await client.query(
      `SELECT COUNT(*) FROM matrizes_curriculares WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Total real de matrizes do Mário Braga: ${mbCountRes.rows[0].count}`);

    console.log('\n--- Turmas do Mário Braga (com matriz_curricular_id atual) ---');
    const mbTurmasRes = await client.query(
      `SELECT id, nome, serie, turno, nivel_ensino, matriz_curricular_id FROM turmas WHERE escola_id = $1 ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(mbTurmasRes.rows);

    if (arlindaMatrizesRes.rows.length > 0) {
      const exemploMatrizId = arlindaMatrizesRes.rows[0].id;
      console.log(`\n--- Exemplo: itens_matriz da matriz_curricular_id=${exemploMatrizId} (Arlinda) ---`);
      const itensRes = await client.query(
        `SELECT im.*, d.nome AS disciplina_nome
         FROM itens_matriz im
         JOIN disciplinas d ON d.id = im.disciplina_id
         WHERE im.matriz_curricular_id = $1`,
        [exemploMatrizId]
      );
      console.table(itensRes.rows);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
