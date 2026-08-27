// limpeza-final-matrizes-e-catalogo.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Passos:
//   1. Apagar itens_matriz das 227 matrizes antigas órfãs do Mário Braga
//   2. Apagar as 227 matrizes antigas
//   3. Inserir em disciplinas_catalogo as 17 disciplinas de catalogo_disciplinas_seed
//      que ainda não existem lá (preserva o currículo de Farmácia)
//   4. DROP TABLE catalogo_disciplinas_seed (redundante após o passo 3)

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString() };

  try {
    await client.query('BEGIN');

    // --- 1 e 2: apagar matrizes antigas órfãs ---
    const antigasRes = await client.query(
      `SELECT id FROM matrizes_curriculares WHERE escola_id = $1 AND id < 519`,
      [MARIO_BRAGA_ORG_ID]
    );
    const idsAntigas = antigasRes.rows.map(r => r.id);
    console.log(`\n--- 1. Matrizes antigas a apagar: ${idsAntigas.length} ---`);

    // Segurança: confirmar de novo que nenhuma turma aponta pra elas
    const aindaVinculadasRes = await client.query(
      `SELECT id FROM turmas WHERE escola_id = $1 AND matriz_curricular_id = ANY($2)`,
      [MARIO_BRAGA_ORG_ID, idsAntigas]
    );
    if (aindaVinculadasRes.rows.length > 0) {
      console.error('ERRO DE SEGURANÇA: ainda há turmas vinculadas às matrizes antigas. Abortando.');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const imDelRes = await client.query(
      `DELETE FROM itens_matriz WHERE matriz_curricular_id = ANY($1) RETURNING id`,
      [idsAntigas]
    );
    console.log(`itens_matriz apagados: ${imDelRes.rowCount}`);

    const mcDelRes = await client.query(
      `DELETE FROM matrizes_curriculares WHERE id = ANY($1) RETURNING id`,
      [idsAntigas]
    );
    console.log(`matrizes_curriculares apagadas: ${mcDelRes.rowCount}`);

    // --- 3: preservar as 17 disciplinas de Farmácia que só existem no seed ---
    console.log('\n--- 2. Preservando disciplinas exclusivas em disciplinas_catalogo ---');
    const seedRes = await client.query(`SELECT nome, codigo_sae, sigla, categoria_curricular_padrao FROM catalogo_disciplinas_seed`);
    const catalogoRes = await client.query(`SELECT nome, codigo_sae FROM disciplinas_catalogo`);
    const codigosCatalogo = new Set(catalogoRes.rows.map(r => r.codigo_sae).filter(Boolean));
    const nomesCatalogo = new Set(catalogoRes.rows.map(r => r.nome.trim().toLowerCase()));

    let inseridas = 0;
    for (const s of seedRes.rows) {
      const existePorCodigo = s.codigo_sae && codigosCatalogo.has(s.codigo_sae);
      const existePorNome = nomesCatalogo.has((s.nome || '').trim().toLowerCase());
      if (existePorCodigo || existePorNome) continue;

      await client.query(
        `INSERT INTO disciplinas_catalogo (nome, codigo_sae, categoria_curricular_padrao)
         VALUES ($1, $2, $3)`,
        [s.nome, s.codigo_sae, s.categoria_curricular_padrao]
      );
      inseridas++;
      // evita reinserir duplicata se aparecer mais de uma vez no loop
      nomesCatalogo.add((s.nome || '').trim().toLowerCase());
    }
    console.log(`Disciplinas inseridas em disciplinas_catalogo: ${inseridas}`);

    // --- 4: descartar catalogo_disciplinas_seed ---
    console.log('\n--- 3. Descartando catalogo_disciplinas_seed (redundante) ---');
    await client.query(`DROP TABLE IF EXISTS catalogo_disciplinas_seed`);
    console.log('Tabela removida.');

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
    const logPath = path.join(__dirname, `log-limpeza-final-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
