const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

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

  const { rows } = await client.query(
    `SELECT h.id, t.nome AS turma, d.nome AS disciplina, h.dia_semana, h.numero_aula
     FROM horarios h
     JOIN turmas t ON t.id = h.turma_id
     JOIN disciplinas d ON d.id = h.disciplina_id
     WHERE h.professor_id = 820 AND t.nome = '3C TEC'`
  );
  console.log(`\nRegistros a apagar (${rows.length}):`);
  for (const r of rows) console.log(`  id=${r.id} | ${r.turma} | ${r.disciplina} | dia=${r.dia_semana} aula=${r.numero_aula}`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para apagar de verdade.');
    await client.end();
    return;
  }

  if (rows.length > 0) {
    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM horarios WHERE id = ANY($1::int[])`, [rows.map((r) => r.id)]);
      await client.query('COMMIT');
      console.log(`\n✓ ${rows.length} registro(s) apagado(s) e commitado(s).`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro — rollback feito:', err.message);
    }
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
