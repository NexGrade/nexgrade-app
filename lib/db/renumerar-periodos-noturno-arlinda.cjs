const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
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

  const { rows: slots } = await client.query(
    `SELECT id, numero_aula, hora_inicio, duracao_minutos FROM horario_slots
     WHERE escola_id = $1 AND turno = 'noturno' ORDER BY numero_aula`,
    [ESCOLA_ID]
  );
  console.log(`\nPeríodos atuais (${slots.length}):`);
  for (const s of slots) console.log(`  id=${s.id}, aula=${s.numero_aula} -> ${s.numero_aula + 1}, hora=${s.hora_inicio}`);

  // confirma que nao ha nenhum horario (oficial ou experimental) usando esses numeros ainda
  const { rows: turma } = await client.query(
    `SELECT id FROM turmas WHERE escola_id = $1 AND turno = 'noturno'`,
    [ESCOLA_ID]
  );
  for (const t of turma) {
    const { rows: h } = await client.query(`SELECT COUNT(*)::int AS n FROM horarios WHERE turma_id = $1`, [t.id]);
    const { rows: he } = await client.query(`SELECT COUNT(*)::int AS n FROM horarios_experimentais WHERE turma_id = $1`, [t.id]);
    console.log(`\nTurma id=${t.id}: ${h[0].n} horarios oficiais, ${he[0].n} experimentais (deve ser 0 pra renumerar com segurança)`);
    if (h[0].n > 0 || he[0].n > 0) {
      console.error('ERRO: existem horários referenciando os números atuais. Abortando por segurança.');
      await client.end();
      process.exit(1);
    }
  }

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    // renumera de tras pra frente (5->6, 4->5, ...) pra nunca colidir com um numero que ainda nao foi movido
    const ordenadoDecrescente = [...slots].sort((a, b) => b.numero_aula - a.numero_aula);
    for (const s of ordenadoDecrescente) {
      await client.query(`UPDATE horario_slots SET numero_aula = $1 WHERE id = $2`, [s.numero_aula + 1, s.id]);
    }
    await client.query('COMMIT');
    console.log('\n✓ Renumerado com sucesso e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
