// investigar-6ta-e-noturno.cjs
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

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // --- 1. Achar os ids exatos das disciplinas divergentes do 6TA ---
    console.log('=== 1. Disciplinas de 6TA vs 6TB (para achar os ids exatos a fundir) ===\n');
    const compRes = await client.query(`
      SELECT t.nome AS turma_nome, td.id AS turma_disciplina_id, d.id AS disciplina_id, d.nome AS disciplina_nome,
             td.carga_horaria_semanal_override, td.professor_id
      FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE t.escola_id = $1 AND t.nome IN ('6TA', '6TB')
      ORDER BY t.nome, d.nome
    `, [MARIO_BRAGA_ORG_ID]);
    console.table(compRes.rows);

    // --- 2. Turmas noturnas médio_tecnico que se repetem por série ---
    console.log('\n=== 2. Turmas noturnas (2NB/2NC e 3NB/3NC) — currículo idêntico? ===\n');
    for (const par of [['2NB', '2NC'], ['3NB', '3NC']]) {
      const res = await client.query(`
        SELECT t.nome AS turma_nome, d.id AS disciplina_id, d.nome AS disciplina_nome,
               td.carga_horaria_semanal_override
        FROM turma_disciplinas td
        JOIN turmas t ON t.id = td.turma_id
        JOIN disciplinas d ON d.id = td.disciplina_id
        WHERE t.escola_id = $1 AND t.nome = ANY($2)
        ORDER BY t.nome, d.nome
      `, [MARIO_BRAGA_ORG_ID, par]);

      const porTurma = new Map();
      for (const row of res.rows) {
        if (!porTurma.has(row.turma_nome)) porTurma.set(row.turma_nome, []);
        porTurma.get(row.turma_nome).push(row);
      }
      const [nomeA, nomeB] = par;
      const setA = new Set((porTurma.get(nomeA) || []).map(r => r.disciplina_id));
      const setB = new Set((porTurma.get(nomeB) || []).map(r => r.disciplina_id));
      const iguais = setA.size === setB.size && [...setA].every(id => setB.has(id));
      console.log(`${nomeA} (${setA.size} disc.) vs ${nomeB} (${setB.size} disc.): ${iguais ? 'IDÊNTICAS ✅' : 'DIFERENTES ⚠️'}`);
      if (!iguais) {
        console.table(res.rows);
      }
    }

    // --- 3. Turmas médio_tecnico "sozinhas" — listar todas pra eu confirmar o agrupamento final ---
    console.log('\n=== 3. Todas as turmas médio_tecnico com contagem de disciplinas (conferência final) ===\n');
    const todasRes = await client.query(`
      SELECT t.nome, t.serie, t.turno,
             (SELECT COUNT(*) FROM turma_disciplinas td WHERE td.turma_id = t.id) AS n_disciplinas
      FROM turmas t
      WHERE t.escola_id = $1 AND t.nivel_ensino = 'medio_tecnico'
      ORDER BY t.nome
    `, [MARIO_BRAGA_ORG_ID]);
    console.table(todasRes.rows);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
