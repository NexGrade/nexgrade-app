// migrar-catalogo-seed-mario-braga.cjs
//
// Operação de ESCRITA. Por padrão roda em modo dry-run (ROLLBACK) —
// mostra exatamente o que seria feito, sem confirmar nada.
// Para aplicar de verdade: node migrar-catalogo-seed-mario-braga.cjs --aplicar
//
// Passos, todos dentro de uma única transação:
//   1. Merge do par duplicado (1651 -> 1650) em turma_disciplinas
//   2. CREATE TABLE IF NOT EXISTS catalogo_disciplinas_seed
//   3. Copiar as disciplinas candidatas (órfãs + nunca referenciadas, já
//      incluindo 1651 pós-merge) para o catálogo
//   4. Apagar itens_matriz que ainda referenciam essas disciplinas (são
//      as itens_matriz órfãs, sem turma viva associada)
//   5. Apagar as linhas correspondentes de disciplinas
//
// Um log completo (JSON) do que foi movido/apagado é sempre salvo,
// mesmo em modo dry-run, para conferência.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERRO: não encontrei .env em ${envPath}`);
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('ERRO: DATABASE_URL não encontrada no .env');
  process.exit(1);
}
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const MERGE_PERDEDOR = 1651; // "Estratégias de Marketing" -> some para 1650
const MERGE_VENCEDOR = 1650; // "Estratégia de Marketing" (canônico)

function carregar(nome) {
  const p = path.join(__dirname, nome);
  if (!fs.existsSync(p)) {
    console.error(`ERRO: não encontrei ${p}. Rode antes o refinar-classificacao-uso-mario-braga.cjs`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR (vai gravar de verdade) ===' : '=== MODO DRY-RUN (nada será gravado — ROLLBACK no final) ===');

  const orfao = carregar('disciplinas-SO-ITENS-MATRIZ-ORFAO.json');
  const nuncaRef = carregar('disciplinas-NUNCA-REFERENCIADA.json');

  // ids candidatos ao catálogo = órfãs + nunca referenciadas + o perdedor do merge
  const idsCatalogo = new Set([
    ...orfao.map(d => d.id),
    ...nuncaRef.map(d => d.id),
    MERGE_PERDEDOR,
  ]);
  console.log(`Total de disciplinas candidatas ao catálogo (incluindo o perdedor do merge): ${idsCatalogo.size}`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = {
    modo: APLICAR ? 'APLICAR' : 'DRY_RUN',
    timestamp: new Date().toISOString(),
    merge: null,
    disciplinasMovidasParaCatalogo: [],
    itensMatrizOrfaosRemovidos: [],
    disciplinasRemovidas: [],
  };

  try {
    await client.query('BEGIN');

    // --- 1. Merge do par duplicado ---
    const antesRes = await client.query(
      `SELECT id, turma_id, professor_id FROM turma_disciplinas WHERE disciplina_id = $1`,
      [MERGE_PERDEDOR]
    );
    console.log(`\n--- 1. Merge: turma_disciplinas com disciplina_id=${MERGE_PERDEDOR} (antes) ---`);
    console.table(antesRes.rows);

    const mergeRes = await client.query(
      `UPDATE turma_disciplinas SET disciplina_id = $1 WHERE disciplina_id = $2 RETURNING id, turma_id, professor_id`,
      [MERGE_VENCEDOR, MERGE_PERDEDOR]
    );
    console.log(`Linhas atualizadas (disciplina_id ${MERGE_PERDEDOR} -> ${MERGE_VENCEDOR}): ${mergeRes.rowCount}`);
    log.merge = { perdedor: MERGE_PERDEDOR, vencedor: MERGE_VENCEDOR, linhasAtualizadas: mergeRes.rows };

    // --- 2. Criar tabela de catálogo ---
    console.log('\n--- 2. Criando (ou confirmando existência de) catalogo_disciplinas_seed ---');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalogo_disciplinas_seed (
        id SERIAL PRIMARY KEY,
        disciplina_id_origem INTEGER,
        nome TEXT NOT NULL,
        codigo_sae TEXT,
        sigla TEXT,
        categoria_curricular_padrao TEXT,
        escola_origem_id TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // --- 3. Copiar candidatas para o catálogo ---
    const idsArray = [...idsCatalogo];
    const candidatasRes = await client.query(
      `SELECT id, nome, codigo_sae, sigla, categoria_curricular_padrao
       FROM disciplinas WHERE id = ANY($1) AND escola_id = $2`,
      [idsArray, MARIO_BRAGA_ORG_ID]
    );
    console.log(`\n--- 3. Disciplinas a copiar para o catálogo: ${candidatasRes.rows.length} ---`);

    for (const d of candidatasRes.rows) {
      const insertRes = await client.query(
        `INSERT INTO catalogo_disciplinas_seed
           (disciplina_id_origem, nome, codigo_sae, sigla, categoria_curricular_padrao, escola_origem_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [d.id, d.nome, d.codigo_sae, d.sigla, d.categoria_curricular_padrao, MARIO_BRAGA_ORG_ID]
      );
      log.disciplinasMovidasParaCatalogo.push({ ...d, novoIdCatalogo: insertRes.rows[0].id });
    }
    console.log(`Inseridas no catálogo: ${log.disciplinasMovidasParaCatalogo.length}`);

    // --- 4. Apagar itens_matriz órfãos que referenciam essas disciplinas ---
    const imParaApagarRes = await client.query(
      `SELECT id, matriz_curricular_id, disciplina_id FROM itens_matriz WHERE disciplina_id = ANY($1)`,
      [idsArray]
    );
    console.log(`\n--- 4. itens_matriz a apagar (órfãos): ${imParaApagarRes.rows.length} ---`);
    log.itensMatrizOrfaosRemovidos = imParaApagarRes.rows;

    const imDeleteRes = await client.query(
      `DELETE FROM itens_matriz WHERE disciplina_id = ANY($1) RETURNING id`,
      [idsArray]
    );
    console.log(`itens_matriz removidos: ${imDeleteRes.rowCount}`);

    // --- 5. Apagar as disciplinas movidas ---
    // Checagem de segurança: garantir que nenhuma delas ainda tem turma_disciplinas
    const aindaLigadasRes = await client.query(
      `SELECT disciplina_id, COUNT(*) FROM turma_disciplinas WHERE disciplina_id = ANY($1) GROUP BY disciplina_id`,
      [idsArray]
    );
    if (aindaLigadasRes.rows.length > 0) {
      console.error('\nERRO DE SEGURANÇA: algumas disciplinas candidatas ainda têm turma_disciplinas ativas. Abortando (ROLLBACK).');
      console.table(aindaLigadasRes.rows);
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const discDeleteRes = await client.query(
      `DELETE FROM disciplinas WHERE id = ANY($1) AND escola_id = $2 RETURNING id, nome`,
      [idsArray, MARIO_BRAGA_ORG_ID]
    );
    console.log(`\n--- 5. Disciplinas removidas de 'disciplinas': ${discDeleteRes.rowCount} ---`);
    log.disciplinasRemovidas = discDeleteRes.rows;

    // --- Contagem final ---
    const restantesRes = await client.query(
      `SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.log(`\nDisciplinas restantes no Mário Braga: ${restantesRes.rows[0].count} (esperado: 99, +2 pelo merge que não muda contagem de disciplinas... conferir)`);

    if (APLICAR) {
      await client.query('COMMIT');
      console.log('\n✅ COMMIT realizado. Alterações gravadas no banco.');
    } else {
      await client.query('ROLLBACK');
      console.log('\n↩️  ROLLBACK (dry-run). Nada foi gravado. Rode com --aplicar para efetivar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERRO — ROLLBACK executado:', err);
    process.exit(1);
  } finally {
    const logPath = path.join(__dirname, `log-migracao-catalogo-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
