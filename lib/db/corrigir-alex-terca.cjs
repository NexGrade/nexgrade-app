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

  const { rows: prof } = await client.query(
    `SELECT id FROM professores WHERE nome = 'Alex S G' AND escola_id = $1`,
    [ESCOLA_ID]
  );
  const profId = prof[0].id;

  // 1. remove o bloqueio de Terça-1 (dia=1, aula=1) -- deve virar aula real dele
  const { rows: bloqueioTerca1 } = await client.query(
    `SELECT id FROM disponibilidade_professores
     WHERE professor_id = $1 AND turno = 'noturno' AND dia_semana = 1 AND horario_slot = 1`,
    [profId]
  );
  console.log(`\nBloqueio em Terça-1 a remover: ${bloqueioTerca1.length} registro(s)`);
  for (const r of bloqueioTerca1) console.log(`  id=${r.id}`);

  // 2. verifica se já existe bloqueio em Terça-5 (não deveria)
  const { rows: bloqueioTerca5 } = await client.query(
    `SELECT id FROM disponibilidade_professores
     WHERE professor_id = $1 AND turno = 'noturno' AND dia_semana = 1 AND horario_slot = 5`,
    [profId]
  );
  console.log(`\nBloqueio em Terça-5 a criar: ${bloqueioTerca5.length === 0 ? '1 (não existe ainda)' : 'JÁ EXISTE, não recria'}`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    if (bloqueioTerca1.length > 0) {
      await client.query(`DELETE FROM disponibilidade_professores WHERE id = ANY($1::int[])`, [bloqueioTerca1.map((r) => r.id)]);
    }
    if (bloqueioTerca5.length === 0) {
      await client.query(
        `INSERT INTO disponibilidade_professores (professor_id, turno, dia_semana, horario_slot, disponivel, motivo)
         VALUES ($1, 'noturno', 1, 5, false, '')`,
        [profId]
      );
    }
    await client.query('COMMIT');
    console.log('\n✓ Alex S G corrigido e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
