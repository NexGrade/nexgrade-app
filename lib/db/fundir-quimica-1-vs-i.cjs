// fundir-quimica-1-vs-i.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Funde "Química 1" (id=551, numeral arábico) com "Química I" (id=912,
// numeral romano) no catálogo mestre -- mesma disciplina/nível, achada
// pela verificação de numerais romanos vs arábicos. Mantém a forma
// romana (padrão dominante no restante do catálogo).

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MANTER_ID = 912; // "Química I"
const APAGAR_ID = 551; // "Química 1"

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString() };

  try {
    await client.query('BEGIN');

    const antesRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE id = ANY($1)`,
      [[MANTER_ID, APAGAR_ID]]
    );
    console.log('Estado atual:');
    console.table(antesRes.rows);

    if (antesRes.rows.length < 2) {
      console.error('ERRO: um dos dois ids não foi encontrado. Abortando.');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const fkRes = await client.query(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'disciplinas_catalogo'
    `);
    for (const fk of fkRes.rows) {
      const usoRes = await client.query(`SELECT COUNT(*) FROM ${fk.table_name} WHERE ${fk.column_name} = $1`, [APAGAR_ID]);
      if (Number(usoRes.rows[0].count) > 0) {
        console.error(`ERRO DE SEGURANÇA: id=${APAGAR_ID} em uso em ${fk.table_name}.${fk.column_name}. Abortando.`);
        await client.query('ROLLBACK');
        process.exit(1);
      }
    }

    const delRes = await client.query(`DELETE FROM disciplinas_catalogo WHERE id = $1 RETURNING id, nome`, [APAGAR_ID]);
    console.log(`\n✅ Apagado id=${APAGAR_ID} ("${delRes.rows[0]?.nome}"). Mantido id=${MANTER_ID} ("Química I").`);
    log.apagado = delRes.rows[0];

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`\nTotal restante em disciplinas_catalogo: ${totalRes.rows[0].count} (era 734)`);

    if (APLICAR) {
      await client.query('COMMIT');
      console.log('\n✅ COMMIT realizado.');
    } else {
      await client.query('ROLLBACK');
      console.log('\n↩️  ROLLBACK (dry-run). Rode com --aplicar para efetivar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERRO — ROLLBACK executado:', err);
    process.exit(1);
  } finally {
    const logPath = path.join(__dirname, `log-fundir-quimica-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
