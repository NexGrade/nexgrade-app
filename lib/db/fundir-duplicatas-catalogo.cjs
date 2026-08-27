// fundir-duplicatas-catalogo.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Para cada par seguro (mesmo nome normalizado, um lado com codigo_sae vazio
// e outro preenchido), apaga a linha com codigo_sae vazio, mantendo a mais completa.
//
// NÃO mexe nos 2 casos ambíguos (Processos Produtivos de Insumos e Produtos
// Biotecnológicos; Segurança do Trabalho) — ambos têm codigo_sae preenchido
// e DIFERENTE nos dois lados, o que sugere disciplinas distintas com nome
// parecido, não duplicata real.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

// [id a manter (com codigo_sae), id a apagar (sem codigo_sae)]
const PARES_SEGUROS = [
  [767, 60],   // Biossegurança
  [863, 132],  // Educação Midiática
  [783, 141],  // Eletrônica
  [147, 146],  // Empreendedorismo
  [657, 193],  // Fundamentos de Farmácia
  [795, 276],  // Informática
  [810, 280],  // Informática I
  [842, 352],  // Logística
  [789, 412],  // Metrologia
  [794, 520],  // Projetos
  [656, 552],  // Química Aplicada
  [814, 562],  // Redes
  [802, 607],  // Soluções Sustentáveis
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');
  console.log(`Total de pares a fundir: ${PARES_SEGUROS.length}\n`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString(), pares: [] };

  try {
    await client.query('BEGIN');

    // Segurança: checar se alguma tabela tem FK apontando pra disciplinas_catalogo
    const fkRes = await client.query(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'disciplinas_catalogo'
    `);
    if (fkRes.rows.length > 0) {
      console.log('AVISO: existem FKs apontando para disciplinas_catalogo:');
      console.table(fkRes.rows);
      console.log('Vou checar cada id a apagar contra essas tabelas antes de deletar.\n');
    } else {
      console.log('Nenhuma FK aponta para disciplinas_catalogo — delete direto é seguro.\n');
    }

    for (const [manterId, apagarId] of PARES_SEGUROS) {
      // Se houver FKs, checar uso antes de apagar
      let podeApagar = true;
      for (const fk of fkRes.rows) {
        const usoRes = await client.query(
          `SELECT COUNT(*) FROM ${fk.table_name} WHERE ${fk.column_name} = $1`,
          [apagarId]
        );
        if (Number(usoRes.rows[0].count) > 0) {
          console.log(`⚠️  id=${apagarId} está em uso em ${fk.table_name}.${fk.column_name} (${usoRes.rows[0].count} linhas) — pulando.`);
          podeApagar = false;
        }
      }

      if (!podeApagar) {
        log.pares.push({ manterId, apagarId, status: 'PULADO_EM_USO' });
        continue;
      }

      const antesRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE id = ANY($1)`, [[manterId, apagarId]]);
      const delRes = await client.query(`DELETE FROM disciplinas_catalogo WHERE id = $1 RETURNING id, nome`, [apagarId]);
      console.log(`✅ Mantido id=${manterId}, apagado id=${apagarId} ("${delRes.rows[0]?.nome}")`);
      log.pares.push({ manterId, apagarId, status: 'OK', detalhes: antesRes.rows });
    }

    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`\nTotal restante em disciplinas_catalogo: ${totalRes.rows[0].count} (era 789)`);

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
    const logPath = path.join(__dirname, `log-fundir-catalogo-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
