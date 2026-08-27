// investigar-professores-e-versoes-grade.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // --- 1. Detalhe completo dos 3 registros de Francielle S. ---
    console.log('=== 1. Registros de "Francielle S." — são a mesma pessoa? ===');
    const francielleRes = await client.query(
      `SELECT id, nome, email, cpf, matricula, telefone, carga_horaria_total, ativo, created_at
       FROM professores WHERE escola_id = $1 AND nome ILIKE 'Francielle%'`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(francielleRes.rows);

    // --- 2. Todos os 12 professores sem vínculo, com mais detalhe ---
    console.log('\n=== 2. Detalhe completo dos 12 professores sem vínculo ===');
    const semVinculoRes = await client.query(`
      SELECT p.id, p.nome, p.email, p.cpf, p.matricula, p.ativo, p.created_at
      FROM professores p
      WHERE p.escola_id = $1
        AND NOT EXISTS (SELECT 1 FROM professor_disciplinas pd WHERE pd.professor_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM turma_disciplinas td WHERE td.professor_id = p.id)
      ORDER BY p.nome, p.created_at
    `, [MARIO_BRAGA_ORG_ID]);
    console.table(semVinculoRes.rows);

    // --- 3. Checar se há outros nomes duplicados entre TODOS os professores (não só os sem vínculo) ---
    console.log('\n=== 3. Nomes de professor duplicados no Mário Braga (todos, não só sem vínculo) ===');
    const todosRes = await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1 ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    const porNome = new Map();
    for (const p of todosRes.rows) {
      const key = p.nome.trim().toLowerCase();
      if (!porNome.has(key)) porNome.set(key, []);
      porNome.get(key).push(p);
    }
    const duplicados = [...porNome.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`Total de professores: ${todosRes.rows.length}`);
    console.log(`Nomes duplicados: ${duplicados.length}`);
    for (const [nome, arr] of duplicados) {
      console.log(`  "${nome}": ids ${arr.map(p => p.id).join(', ')}`);
    }

    // --- 4. versao_grade em horarios — quantas versões distintas existem? ---
    console.log('\n\n=== 4. horarios — distribuição por versao_grade ===');
    const versoesRes = await client.query(`
      SELECT versao_grade, COUNT(*) AS n_linhas, COUNT(DISTINCT turma_id) AS n_turmas, MIN(created_at) AS primeiro, MAX(created_at) AS ultimo
      FROM horarios
      WHERE escola_id = $1
      GROUP BY versao_grade
      ORDER BY ultimo DESC
    `, [MARIO_BRAGA_ORG_ID]);
    console.table(versoesRes.rows);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
