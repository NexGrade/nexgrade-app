// padronizar-nomes-disciplinas-mario-braga.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Renomeia disciplinas do Mário Braga do estilo longo para o estilo curto
// já usado pela Arlinda (decidido como padrão do produto). Só altera o
// campo `nome` — não mexe em id, turma_disciplinas ou itens_matriz.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

const RENOMEACOES = [
  { de: 'Ciências (Fundamental)', para: 'Ciências' },
  { de: 'Língua Estrangeira Moderna - Inglês', para: 'Língua Inglesa' },
  { de: 'Língua Portuguesa e Literatura', para: 'Língua Portuguesa' },
  { de: 'Recomposição da Aprendizagem - Matemática', para: 'Rec. Aprend. Matemática' },
  { de: 'Leitura e Recomposição da Aprendizagem - Língua Portuguesa', para: 'Rec. Aprend. L. Port' },
  { de: 'Estratégia de Marketing', para: 'Estratégias de Marketing' },
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString(), renomeacoes: [] };

  try {
    await client.query('BEGIN');

    for (const r of RENOMEACOES) {
      // Checagem de segurança: já existe uma disciplina DIFERENTE com o nome de destino?
      const colisaoRes = await client.query(
        `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome = $2`,
        [MARIO_BRAGA_ORG_ID, r.para]
      );
      if (colisaoRes.rows.length > 0) {
        console.error(`\n⚠️  ABORTANDO "${r.de}" -> "${r.para}": já existe disciplina com esse nome (id ${colisaoRes.rows[0].id}). Verificar manualmente.`);
        log.renomeacoes.push({ ...r, status: 'ABORTADO_COLISAO', colisaoComId: colisaoRes.rows[0].id });
        continue;
      }

      const updRes = await client.query(
        `UPDATE disciplinas SET nome = $1 WHERE escola_id = $2 AND nome = $3 RETURNING id, nome`,
        [r.para, MARIO_BRAGA_ORG_ID, r.de]
      );

      if (updRes.rowCount === 0) {
        console.log(`\n(nenhuma linha encontrada para "${r.de}" — pode já ter sido renomeada, ou nome mudou)`);
        log.renomeacoes.push({ ...r, status: 'NAO_ENCONTRADO' });
        continue;
      }

      console.log(`✅ "${r.de}" -> "${r.para}" (id ${updRes.rows[0].id})`);
      log.renomeacoes.push({ ...r, status: 'OK', id: updRes.rows[0].id });
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
    const logPath = path.join(__dirname, `log-padronizar-nomes-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
