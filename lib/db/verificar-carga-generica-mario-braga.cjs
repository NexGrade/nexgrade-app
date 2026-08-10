const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MARIO_BRAGA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows } = await client.query(
    `SELECT t.nome AS turma, d.nome AS disciplina,
            d.carga_semanal AS carga_generica,
            td.carga_horaria_semanal_override AS override,
            im.carga_horaria_semanal AS carga_real_matriz
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE t.escola_id = $1
     ORDER BY t.nome, d.nome`,
    [MARIO_BRAGA_ID]
  );

  console.log(`Total de vínculos turma_disciplinas no Mário Braga: ${rows.length}`);

  const comOverride = rows.filter((r) => r.override != null);
  const semOverrideComMatriz = rows.filter((r) => r.override == null && r.carga_real_matriz != null);
  const semNada = rows.filter((r) => r.override == null && r.carga_real_matriz == null);

  console.log(`  Com override na turma_disciplinas (usa esse valor, sempre correto): ${comOverride.length}`);
  console.log(`  Sem override, mas COM item de matriz (usaria o genérico ERRADO antes do fix): ${semOverrideComMatriz.length}`);
  console.log(`  Sem override e SEM item de matriz (sempre usou o genérico, não há "certo" pra comparar): ${semNada.length}`);

  const divergentes = semOverrideComMatriz.filter((r) => String(r.carga_generica) !== String(r.carga_real_matriz));
  console.log(`\nDivergências reais (genérico != matriz, onde o bug afetava de verdade): ${divergentes.length}`);
  for (const r of divergentes) {
    console.log(`  ${r.turma} / ${r.disciplina}: genérico=${r.carga_generica}, real=${r.carga_real_matriz}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
