const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');

// ids criados errado pela tela de ajuste manual (a re-verificar no dry-run)
const IDS_ERRADOS = [125, 126, 127, 128, 129, 130];

// configuracao correta original (period 0 = id 83, ja existe e esta certo)
const PERIODOS_CORRETOS = [
  { numeroAula: 1, horaInicio: '18:45:00', duracaoMinutos: 50 },
  { numeroAula: 2, horaInicio: '19:35:00', duracaoMinutos: 50 },
  { numeroAula: 3, horaInicio: '20:35:00', duracaoMinutos: 50 },
  { numeroAula: 4, horaInicio: '21:25:00', duracaoMinutos: 50 },
  { numeroAula: 5, horaInicio: '22:10:00', duracaoMinutos: 50 },
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

  const { rows: existentes } = await client.query(
    `SELECT id, numero_aula, hora_inicio, duracao_minutos, letivo FROM horario_slots WHERE id = ANY($1::int[])`,
    [IDS_ERRADOS]
  );
  console.log(`\nPeríodos errados a remover (${existentes.length} de ${IDS_ERRADOS.length} esperados):`);
  for (const r of existentes) console.log(`  id=${r.id}, aula=${r.numero_aula}, hora=${r.hora_inicio}, ${r.duracao_minutos}min`);
  if (existentes.length !== IDS_ERRADOS.length) {
    console.error('\nERRO: quantidade de linhas não bate com o esperado. Abortando por segurança.');
    await client.end();
    process.exit(1);
  }

  const { rows: turma } = await client.query(
    `SELECT id FROM turmas WHERE escola_id = $1 AND nome = '3D TEC'`,
    [ESCOLA_ID]
  );
  const { rows: horariosIncompletos } = await client.query(
    `SELECT COUNT(*)::int AS n FROM horarios WHERE turma_id = $1`,
    [turma[0].id]
  );
  console.log(`\nHorários oficiais incompletos da 3D TEC a apagar: ${horariosIncompletos[0].n}`);

  console.log('\nPeríodos corretos a recriar (1-5):');
  for (const p of PERIODOS_CORRETOS) console.log(`  aula=${p.numeroAula}, hora=${p.horaInicio}, ${p.duracaoMinutos}min`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(`DELETE FROM horario_slots WHERE id = ANY($1::int[])`, [IDS_ERRADOS]);
    for (const p of PERIODOS_CORRETOS) {
      await client.query(
        `INSERT INTO horario_slots (escola_id, turno, numero_aula, hora_inicio, duracao_minutos, letivo)
         VALUES ($1, 'noturno', $2, $3, $4, true)`,
        [ESCOLA_ID, p.numeroAula, p.horaInicio, p.duracaoMinutos]
      );
    }
    await client.query(`DELETE FROM horarios WHERE turma_id = $1`, [turma[0].id]);
    await client.query('COMMIT');
    console.log('\n✓ Configuração de períodos restaurada e horários incompletos apagados. Commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
