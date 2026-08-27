// fundir-duplicatas-catalogo-fase2.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Funde os pares confirmados manualmente (abreviação vs forma completa
// da MESMA disciplina, achados pela varredura fuzzy por palavras):
//   mantém sempre a forma completa/canônica, apaga a abreviada.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

// [id a manter (forma completa), id a apagar (abreviada)]
const PARES_CONFIRMADOS = [
  [658, 176, 'Fundamentos da fisiopatologia'],
  [772, 235, 'Gestão de recursos naturais'],
  [796, 473, 'Princípios de administração'],
  [911, 347, 'Literatura e Produção de Texto'],
  [915, 620, 'Tecnologia e Ferramenta de Gestão'],
  [557, 556, 'Rec. Aprend. Matemática'],
  [905, 170, 'Filosofia Análises de textos Filosóficos'],
  [337, 336, 'Lei Rec. Aprend. L. Port'],
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');
  console.log(`Total de pares: ${PARES_CONFIRMADOS.length}\n`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString(), pares: [] };

  try {
    await client.query('BEGIN');

    const fkRes = await client.query(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'disciplinas_catalogo'
    `);

    for (const [manterId, apagarId, descricao] of PARES_CONFIRMADOS) {
      let podeApagar = true;
      for (const fk of fkRes.rows) {
        const usoRes = await client.query(`SELECT COUNT(*) FROM ${fk.table_name} WHERE ${fk.column_name} = $1`, [apagarId]);
        if (Number(usoRes.rows[0].count) > 0) {
          console.log(`⚠️  id=${apagarId} em uso em ${fk.table_name}.${fk.column_name} — pulando "${descricao}".`);
          podeApagar = false;
        }
      }
      if (!podeApagar) {
        log.pares.push({ manterId, apagarId, descricao, status: 'PULADO_EM_USO' });
        continue;
      }

      const antesRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE id = ANY($1)`, [[manterId, apagarId]]);
      const delRes = await client.query(`DELETE FROM disciplinas_catalogo WHERE id = $1 RETURNING id, nome`, [apagarId]);
      console.log(`✅ [${descricao}] mantido id=${manterId}, apagado id=${apagarId} ("${delRes.rows[0]?.nome}")`);
      log.pares.push({ manterId, apagarId, descricao, status: 'OK', detalhes: antesRes.rows });
    }

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`\nTotal restante em disciplinas_catalogo: ${totalRes.rows[0].count} (era 776)`);

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
    const logPath = path.join(__dirname, `log-fundir-catalogo-fase2-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
