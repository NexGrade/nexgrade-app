// corrigir-canonico-rec-aprend-l-port.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// CORREÇÃO de uma escolha errada no merge anterior (fundir-duplicatas-
// catalogo-fase2.cjs): mantive id=337 "Lei Rec. Aprend. L. Port" como
// canônico, mas o padrão já adotado no produto (Mário Braga/Arlinda,
// ver padronizar-nomes-disciplinas-mario-braga.cjs) para esta mesma
// disciplina ("Leitura e Recomposição da Aprendizagem - Língua
// Portuguesa") é "Rec. Aprend. L. Port" -- que é exatamente o id=555,
// não o 337. "Lei" no 337 parece ser sobra de digitação da importação
// malformada, não parte do nome real.
//
// Esta correção: apaga id=337, mantém id=555 como único canônico.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MANTER_ID = 555; // "Rec. Aprend. L. Port" -- bate com o padrão já adotado
const APAGAR_ID = 337; // "Lei Rec. Aprend. L. Port" -- escolha errada do merge anterior

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
      console.error('ERRO: um dos dois ids não foi encontrado (pode já ter sido corrigido antes). Abortando.');
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
    console.log(`\n✅ Apagado id=${APAGAR_ID} ("${delRes.rows[0]?.nome}"). Mantido id=${MANTER_ID} ("Rec. Aprend. L. Port") como único canônico.`);
    log.apagado = delRes.rows[0];
    log.mantido = { id: MANTER_ID, nome: 'Rec. Aprend. L. Port' };

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`\nTotal restante em disciplinas_catalogo: ${totalRes.rows[0].count} (era 735)`);

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
    const logPath = path.join(__dirname, `log-corrigir-canonico-lport-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
