// varredura-geral-lixo.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

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
    // --- 1. professor_disciplinas apontando pra disciplinas que não existem mais ---
    console.log('=== 1. professor_disciplinas — vínculos com disciplinas inexistentes ===');
    const pdCols = await getColumns(client, 'professor_disciplinas');
    console.log('Colunas:', pdCols);

    const pdOrfaosRes = await client.query(`
      SELECT pd.id, pd.professor_id, pd.disciplina_id
      FROM professor_disciplinas pd
      LEFT JOIN disciplinas d ON d.id = pd.disciplina_id
      WHERE d.id IS NULL
    `);
    console.log(`professor_disciplinas órfãs (disciplina não existe mais): ${pdOrfaosRes.rows.length}`);
    console.table(pdOrfaosRes.rows.slice(0, 20));

    // --- 2. horarios e horarios_experimentais presos a matrizes/turmas do Mário Braga ---
    console.log('\n=== 2. horarios / horarios_experimentais — Mário Braga ===');
    for (const tabela of ['horarios', 'horarios_experimentais']) {
      const cols = await getColumns(client, tabela);
      console.log(`\nColunas de ${tabela}:`, cols);
      const escolaCol = cols.includes('escola_id') ? 'escola_id' : null;
      if (escolaCol) {
        const countRes = await client.query(
          `SELECT COUNT(*) FROM ${tabela} WHERE ${escolaCol} = $1`, [MARIO_BRAGA_ORG_ID]
        );
        console.log(`Total de linhas para Mário Braga em ${tabela}: ${countRes.rows[0].count}`);
      }
    }

    // --- 3. itens_matriz órfãos de matriz (sanity check pós-limpeza) ---
    console.log('\n=== 3. itens_matriz cuja matriz_curricular_id não existe mais (deveria ser 0) ===');
    const imOrfaosRes = await client.query(`
      SELECT im.id, im.matriz_curricular_id
      FROM itens_matriz im
      LEFT JOIN matrizes_curriculares mc ON mc.id = im.matriz_curricular_id
      WHERE mc.id IS NULL
    `);
    console.log(`itens_matriz órfãos de matriz (todas as escolas): ${imOrfaosRes.rows.length}`);

    // --- 4. turma_disciplinas órfãs de disciplina (sanity check) ---
    console.log('\n=== 4. turma_disciplinas cuja disciplina não existe mais (Mário Braga) ===');
    const tdOrfaosRes = await client.query(`
      SELECT td.id, td.turma_id, td.disciplina_id
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      LEFT JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE t.escola_id = $1 AND d.id IS NULL
    `, [MARIO_BRAGA_ORG_ID]);
    console.log(`turma_disciplinas órfãs: ${tdOrfaosRes.rows.length}`);

    // --- 5. Professores do Mário Braga sem NENHUM vínculo em professor_disciplinas nem turma_disciplinas ---
    console.log('\n=== 5. Professores do Mário Braga sem nenhuma disciplina/turma vinculada ===');
    const profCols = await getColumns(client, 'professores');
    console.log('Colunas de professores:', profCols);
    const profOrfaosRes = await client.query(`
      SELECT p.id, p.nome
      FROM professores p
      WHERE p.escola_id = $1
        AND NOT EXISTS (SELECT 1 FROM professor_disciplinas pd WHERE pd.professor_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM turma_disciplinas td WHERE td.professor_id = p.id)
    `, [MARIO_BRAGA_ORG_ID]);
    console.log(`Professores sem nenhum vínculo: ${profOrfaosRes.rows.length}`);
    console.table(profOrfaosRes.rows);

    // --- 6. disciplinas do Mário Braga (deveriam ser só as 98 em uso — sanity final) ---
    console.log('\n=== 6. Sanity final: disciplinas do Mário Braga ===');
    const finalCountRes = await client.query(
      `SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Total: ${finalCountRes.rows[0].count} (esperado: 98)`);

    const semUsoRes = await client.query(`
      SELECT d.id, d.nome
      FROM disciplinas d
      WHERE d.escola_id = $1
        AND NOT EXISTS (SELECT 1 FROM turma_disciplinas td WHERE td.disciplina_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM itens_matriz im WHERE im.disciplina_id = d.id)
    `, [MARIO_BRAGA_ORG_ID]);
    console.log(`Disciplinas sem NENHUM uso (turma_disciplinas nem itens_matriz): ${semUsoRes.rows.length}`);
    console.table(semUsoRes.rows);

    // --- 7. matrizes_curriculares do Mário Braga sem nenhuma turma vinculada (deveriam ser só as 22 válidas) ---
    console.log('\n=== 7. Sanity final: matrizes_curriculares do Mário Braga ===');
    const matrizesFinalRes = await client.query(
      `SELECT COUNT(*) FROM matrizes_curriculares WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Total: ${matrizesFinalRes.rows[0].count} (esperado: 22)`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
