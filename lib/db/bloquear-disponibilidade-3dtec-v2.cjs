const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');
const DIAS_NOME = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'];
const TODAS_AULAS = [1, 2, 3, 4, 5, 6];

// dia: 0=Segunda .. 4=Sexta. Lista = periodos LIVRES (o resto vira bloqueado).
const LIVRES = {
  'Lucas': { 0: [2, 5, 6], 4: [1, 2, 3] },
  'Cinara': { 0: [1, 2] },
  'Willian B': { 3: [1, 2] },
  'Mayra': { 2: [5, 6] },
  'Willian': { 2: [1], 3: [3, 4, 5] },
  'Deilza S B K': { 0: [3, 4], 1: [2, 3] },
  'Jose E F': { 2: [4], 3: [6] },
  'Alex S G': { 1: [5] },
  'Rafaela': { 2: [2, 3] },
};

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

  const plano = [];
  for (const [nome, livrePorDia] of Object.entries(LIVRES)) {
    const { rows } = await client.query(`SELECT id FROM professores WHERE nome = $1 AND escola_id = $2`, [nome, ESCOLA_ID]);
    if (rows.length !== 1) {
      console.error(`ERRO: esperava 1 professor "${nome}", achei ${rows.length}.`);
      await client.end();
      process.exit(1);
    }
    const profId = rows[0].id;

    console.log(`\n${nome} (id=${profId}):`);
    for (let dia = 0; dia < 5; dia++) {
      const livres = livrePorDia[dia] ?? [];
      const bloqueados = TODAS_AULAS.filter((a) => !livres.includes(a));
      console.log(`  ${DIAS_NOME[dia]}: livre=[${livres.join(',') || '-'}], bloqueado=[${bloqueados.join(',')}]`);
      for (const aula of bloqueados) {
        const { rows: existente } = await client.query(
          `SELECT id FROM disponibilidade_professores
           WHERE professor_id = $1 AND turno = 'noturno' AND dia_semana = $2 AND horario_slot = $3`,
          [profId, dia, aula]
        );
        plano.push({ profId, nome, dia, aula, existenteId: existente[0]?.id });
      }
    }
  }

  const novos = plano.filter((p) => !p.existenteId);
  const jaExistiam = plano.filter((p) => p.existenteId);
  console.log(`\nResumo: ${novos.length} registros novos a criar, ${jaExistiam.length} já existiam (não mexe).`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const p of novos) {
      await client.query(
        `INSERT INTO disponibilidade_professores (professor_id, turno, dia_semana, horario_slot, disponivel, motivo)
         VALUES ($1, 'noturno', $2, $3, false, '')`,
        [p.profId, p.dia, p.aula]
      );
    }
    await client.query('COMMIT');
    console.log(`\n✓ ${novos.length} registros criados e commitados.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
