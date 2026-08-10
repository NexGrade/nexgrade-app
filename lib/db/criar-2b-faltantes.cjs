const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const TURMA_ID = 435;

const NOVOS = [
  { disciplinaId: 2649, professorId: 798, horas: 2, nome: 'Filosofia Análises de Textos Filosóficos', professorNome: 'Eucledio L K' },
  { disciplinaId: 2671, professorId: 819, horas: 2, nome: 'Sociologia Gov Cid Sociedade', professorNome: 'Will' },
];

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');

  for (const n of NOVOS) {
    const { rows } = await client.query(
      `SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
      [TURMA_ID, n.disciplinaId]
    );
    if (rows.length > 0) {
      console.error(`ERRO: já existe vínculo pra "${n.nome}" na 2B (id=${rows[0].id}). Parando por segurança.`);
      await client.end();
      process.exit(1);
    }
    console.log(`  2B / "${n.nome}" | professor="${n.professorNome}" | ${n.horas}h -> CRIAR`);
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const n of NOVOS) {
      await client.query(
        `INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id, carga_horaria_semanal_override)
         VALUES ($1, $2, $3, $4)`,
        [TURMA_ID, n.disciplinaId, n.professorId, n.horas]
      );
    }
    await client.query('COMMIT');
    console.log('\n✓ Criado e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
