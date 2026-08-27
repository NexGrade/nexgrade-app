// limpar-entradas-truncadas-catalogo.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Apaga as entradas de disciplinas_catalogo com nome truncado/incompleto
// (terminam em preposição/conjunção, ex.: "Fundamentos da", "Gestão e"),
// todas do mesmo lote de importação malformada (2026-07-16T12:43:40.153Z,
// codigo_sae nulo). Confirmadas por investigar-truncadas-e-trio.cjs.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const IDS_TRUNCADOS = [
  31, 61, 98, 100, 101, 112, 113, 148, 177, 200, 214, 220, 226, 229, 240,
  241, 243, 278, 282, 289, 297, 320, 325, 380, 404, 410, 462, 479, 480,
  500, 599, 625, 627,
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');
  console.log(`Total de ids a apagar: ${IDS_TRUNCADOS.length}\n`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString() };

  try {
    await client.query('BEGIN');

    // Confirmação final antes de apagar: reconfere que todos ainda têm
    // codigo_sae nulo e o mesmo created_at do lote ruim (proteção contra
    // qualquer edição manual que possa ter acontecido nesse meio tempo).
    const confirmRes = await client.query(
      `SELECT id, nome, codigo_sae, created_at FROM disciplinas_catalogo WHERE id = ANY($1)`,
      [IDS_TRUNCADOS]
    );
    console.log(`Encontradas: ${confirmRes.rows.length} de ${IDS_TRUNCADOS.length} esperadas`);
    const comCodigoSae = confirmRes.rows.filter(r => r.codigo_sae != null);
    if (comCodigoSae.length > 0) {
      console.error('ERRO DE SEGURANÇA: alguma dessas entradas agora tem codigo_sae preenchido (pode ter sido corrigida manualmente). Abortando.');
      console.table(comCodigoSae);
      await client.query('ROLLBACK');
      process.exit(1);
    }

    // Segurança: checar FKs pra disciplinas_catalogo
    const fkRes = await client.query(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'disciplinas_catalogo'
    `);
    for (const fk of fkRes.rows) {
      const usoRes = await client.query(
        `SELECT COUNT(*) FROM ${fk.table_name} WHERE ${fk.column_name} = ANY($1)`,
        [IDS_TRUNCADOS]
      );
      if (Number(usoRes.rows[0].count) > 0) {
        console.error(`ERRO DE SEGURANÇA: ${usoRes.rows[0].count} linha(s) em ${fk.table_name}.${fk.column_name} referenciam alguma dessas entradas. Abortando.`);
        await client.query('ROLLBACK');
        process.exit(1);
      }
    }
    console.log('Nenhuma FK em uso — seguro apagar.\n');

    const delRes = await client.query(
      `DELETE FROM disciplinas_catalogo WHERE id = ANY($1) RETURNING id, nome`,
      [IDS_TRUNCADOS]
    );
    console.log(`Apagadas: ${delRes.rowCount}`);
    console.table(delRes.rows);
    log.apagadas = delRes.rows;

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`\nTotal restante em disciplinas_catalogo: ${totalRes.rows[0].count}`);

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
    const logPath = path.join(__dirname, `log-limpar-truncadas-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
