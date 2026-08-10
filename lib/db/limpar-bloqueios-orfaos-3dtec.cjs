const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');

// registros que ficaram bloqueados por engano, da versao antiga (antes
// da correcao dos horarios reais do Willian e do Jose E F)
const REMOVER = [
  { nome: 'Willian', dia: 3, aula: 4 },   // Quinta-4a, agora e aula real dele
  { nome: 'Jose E F', dia: 2, aula: 4 },  // Quarta-4a, agora e aula real dele
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

  const idsParaRemover = [];
  for (const r of REMOVER) {
    const { rows: prof } = await client.query(
      `SELECT id FROM professores WHERE nome = $1 AND escola_id = $2`,
      [r.nome, ESCOLA_ID]
    );
    if (prof.length !== 1) {
      console.error(`ERRO: esperava 1 professor "${r.nome}", achei ${prof.length}.`);
      await client.end();
      process.exit(1);
    }
    const { rows: reg } = await client.query(
      `SELECT id, disponivel FROM disponibilidade_professores
       WHERE professor_id = $1 AND turno = 'noturno' AND dia_semana = $2 AND horario_slot = $3`,
      [prof[0].id, r.dia, r.aula]
    );
    console.log(`\n${r.nome} (dia=${r.dia}, aula=${r.aula}): ${reg.length} registro(s) encontrado(s)`);
    for (const x of reg) {
      console.log(`  id=${x.id}, disponivel=${x.disponivel}`);
      idsParaRemover.push(x.id);
    }
  }

  console.log(`\nTotal a remover: ${idsParaRemover.length}`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para remover de verdade.');
    await client.end();
    return;
  }

  if (idsParaRemover.length > 0) {
    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM disponibilidade_professores WHERE id = ANY($1::int[])`, [idsParaRemover]);
      await client.query('COMMIT');
      console.log(`\n✓ ${idsParaRemover.length} registro(s) removido(s) e commitado(s).`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro — rollback feito:', err.message);
    }
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
