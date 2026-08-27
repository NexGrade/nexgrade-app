// verificar-premissas-reconstrucao.cjs
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
    // --- 1. Conjunto exato de disciplinas por turma, agrupado por série (Fundamental) ---
    const turmasRes = await client.query(
      `SELECT id, nome, serie, turno, nivel_ensino FROM turmas
       WHERE escola_id = $1 AND nivel_ensino = 'fundamental' ORDER BY serie, nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    const tdRes = await client.query(
      `SELECT td.turma_id, td.disciplina_id, d.nome AS disciplina_nome
       FROM turma_disciplinas td
       JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE td.turma_id IN (SELECT id FROM turmas WHERE escola_id = $1 AND nivel_ensino = 'fundamental')`,
      [MARIO_BRAGA_ORG_ID]
    );
    const discPorTurma = new Map();
    for (const row of tdRes.rows) {
      if (!discPorTurma.has(row.turma_id)) discPorTurma.set(row.turma_id, new Set());
      discPorTurma.get(row.turma_id).add(row.disciplina_nome);
    }

    const porSerie = new Map();
    for (const t of turmasRes.rows) {
      if (!porSerie.has(t.serie)) porSerie.set(t.serie, []);
      porSerie.get(t.serie).push(t);
    }

    console.log('=== 1. Conjunto de disciplinas por série (Fundamental) — são todos IDÊNTICOS? ===\n');
    for (const [serie, turmas] of porSerie) {
      console.log(`--- ${serie} (${turmas.length} turmas) ---`);
      const conjuntos = turmas.map(t => ({
        turma: t.nome,
        set: discPorTurma.get(t.id) || new Set(),
      }));
      const primeiro = conjuntos[0];
      let todosIguais = true;
      for (const c of conjuntos) {
        const igual = c.set.size === primeiro.set.size && [...c.set].every(d => primeiro.set.has(d));
        if (!igual) todosIguais = false;
        console.log(`  ${c.turma}: ${c.set.size} disciplinas ${igual ? '✅ igual à primeira' : '⚠️ DIFERENTE'}`);
      }
      if (!todosIguais) {
        console.log(`  >>> Diferenças encontradas em ${serie}. Detalhe:`);
        for (const c of conjuntos) {
          console.log(`    ${c.turma}: [${[...c.set].sort().join(', ')}]`);
        }
      }
      console.log(`  Resultado: ${todosIguais ? 'TODAS IDÊNTICAS ✅' : 'HÁ VARIAÇÃO ⚠️'}\n`);
    }

    // --- 2. carga_horaria_semanal_override em turma_disciplinas ---
    console.log('\n=== 2. carga_horaria_semanal_override em turma_disciplinas (Mário Braga) ===');
    const overrideRes = await client.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(carga_horaria_semanal_override) AS preenchidas,
         COUNT(*) - COUNT(carga_horaria_semanal_override) AS nulas
       FROM turma_disciplinas
       WHERE turma_id IN (SELECT id FROM turmas WHERE escola_id = $1)`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(overrideRes.rows);

    console.log('\nAmostra de 15 linhas de turma_disciplinas (Mário Braga):');
    const amostraRes = await client.query(
      `SELECT td.id, t.nome AS turma_nome, d.nome AS disciplina_nome, td.carga_horaria_semanal_override
       FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id
       JOIN disciplinas d ON d.id = td.disciplina_id
       WHERE t.escola_id = $1
       LIMIT 15`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(amostraRes.rows);

    // --- 3. horario_slots existe e tem dados pro Mário Braga? (fonte alternativa de carga horária real) ---
    console.log('\n=== 3. horario_slots — existe contagem real de aulas por turma+disciplina? ===');
    const slotsColsRes = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'horario_slots' ORDER BY ordinal_position`
    );
    console.log('Colunas de horario_slots:', slotsColsRes.rows.map(r => r.column_name));

    const slotsCountRes = await client.query(
      `SELECT COUNT(*) FROM horario_slots WHERE turma_id IN (SELECT id FROM turmas WHERE escola_id = $1)`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Total de horario_slots para turmas do Mário Braga: ${slotsCountRes.rows[0].count}`);

    if (Number(slotsCountRes.rows[0].count) > 0) {
      const exemploSlotsRes = await client.query(
        `SELECT hs.turma_id, t.nome AS turma_nome, hs.disciplina_id, d.nome AS disciplina_nome, COUNT(*) AS ocorrencias_semana
         FROM horario_slots hs
         JOIN turmas t ON t.id = hs.turma_id
         JOIN disciplinas d ON d.id = hs.disciplina_id
         WHERE t.escola_id = $1 AND t.nome = '1NF ADM'
         GROUP BY hs.turma_id, t.nome, hs.disciplina_id, d.nome
         ORDER BY d.nome`,
        [MARIO_BRAGA_ORG_ID]
      );
      console.log("\nExemplo: contagem semanal real de aulas por disciplina na turma '1NF ADM' (via horario_slots):");
      console.table(exemploSlotsRes.rows);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
