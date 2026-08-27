// corrigir-codigo-sae-mario-braga.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Corrige os 20 codigo_sae divergentes encontrados no Mário Braga,
// usando o catálogo mestre (disciplinas_catalogo) como fonte de verdade.
// Os codigos atuais do Mário Braga (numeros redondos tipo 4100, 2500,
// 3200... ou mnemônicos tipo EDFIN, PV01) sao sinteticos de alguma
// importacao antiga -- nao seguem o formato real (ex.: 101, 201, 601,
// 901, visto no catalogo e ja usado corretamente pela Arlinda).

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

// [id, nome (só pra conferência visual), novo_codigo_sae (null = limpa)]
const CORRECOES = [
  [1624, 'Arte', '704'],
  [1627, 'Banco de Dados', '4443'],
  [1631, 'Biologia', '1001'],
  [1634, 'Ciências', '801'],
  [1645, 'Educação Financeira', null],
  [1646, 'Educação Física', '601'],
  [1647, 'Empreendedorismo', '2334'],
  [1648, 'Ensino Religioso', null],
  [1656, 'Filosofia', '2201'],
  [1660, 'Física', '901'],
  [1663, 'Geografia', '2001'],
  [1670, 'História', '1901'],
  [1673, 'In Tec e Empreendedorismo', null],
  [1682, 'Língua Inglesa', '1501'],
  [1684, 'Língua Portuguesa', '101'],
  [1687, 'Matemática', '201'],
  [1700, 'Projeto de Vida', null],
  [1701, 'Química', '1101'],
  [1706, 'Redação e Leitura', null],
  [1711, 'Sociologia', '2301'],
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');
  console.log(`Total de correções: ${CORRECOES.length}\n`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString(), correcoes: [] };

  try {
    await client.query('BEGIN');

    for (const [id, nomeEsperado, novoCodigo] of CORRECOES) {
      const antesRes = await client.query(
        `SELECT id, nome, codigo_sae FROM disciplinas WHERE id = $1 AND escola_id = $2`,
        [id, MARIO_BRAGA_ORG_ID]
      );
      if (antesRes.rows.length === 0) {
        console.error(`⚠️  id=${id} não encontrado — pulando.`);
        log.correcoes.push({ id, nomeEsperado, status: 'NAO_ENCONTRADO' });
        continue;
      }
      const atual = antesRes.rows[0];
      if (atual.nome !== nomeEsperado) {
        console.error(`⚠️  id=${id} tem nome "${atual.nome}", esperava "${nomeEsperado}" — pulando por segurança.`);
        log.correcoes.push({ id, nomeEsperado, nomeReal: atual.nome, status: 'NOME_DIVERGENTE' });
        continue;
      }

      const updRes = await client.query(
        `UPDATE disciplinas SET codigo_sae = $1 WHERE id = $2 RETURNING id, nome, codigo_sae`,
        [novoCodigo, id]
      );
      const codigoTexto = novoCodigo === null ? '(limpo/null)' : novoCodigo;
      console.log(`✅ [${nomeEsperado}] id=${id}: "${atual.codigo_sae}" -> "${codigoTexto}"`);
      log.correcoes.push({ id, nome: nomeEsperado, de: atual.codigo_sae, para: novoCodigo, status: 'OK' });
    }

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
    const logPath = path.join(__dirname, `log-corrigir-sae-mario-braga-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
