// cruzar-disciplinas-uso-mario-braga.cjs
// LEITURA APENAS — nenhuma escrita no banco.
// Objetivo: para cada uma das disciplinas cadastradas no Mário Braga,
// verificar se ela está referenciada em itens_matriz e/ou turma_disciplinas.
// - Referenciada em pelo menos uma  => currículo real (fica no Mário Braga)
// - Nunca referenciada              => candidata a mover para o catálogo SEED
//
// Escreve dois arquivos JSON de saída:
//   disciplinas-mario-braga-EM-USO.json
//   disciplinas-mario-braga-CANDIDATAS-CATALOGO.json

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// --- Carregar DATABASE_URL de lib/db/.env (mesmo padrão dos scripts anteriores) ---
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERRO: não encontrei .env em ${envPath}`);
  console.error('Copie lib/db/.env para a mesma pasta deste script, ou ajuste o caminho.');
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

async function findFkColumn(client, tableName) {
  // Descobre dinamicamente qual coluna de `tableName` referencia disciplinas,
  // em vez de assumir o nome (lição: nomes de coluna já causaram bugs antes).
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND column_name ILIKE '%disciplina%'`,
    [tableName]
  );
  return res.rows.map(r => r.column_name);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log('--- Descobrindo colunas relevantes ---');
    const itensMatrizCols = await findFkColumn(client, 'itens_matriz');
    const turmaDisciplinasCols = await findFkColumn(client, 'turma_disciplinas');
    console.log('itens_matriz, colunas candidatas:', itensMatrizCols);
    console.log('turma_disciplinas, colunas candidatas:', turmaDisciplinasCols);

    if (itensMatrizCols.length === 0 || turmaDisciplinasCols.length === 0) {
      console.error('ERRO: não encontrei coluna referenciando disciplina em uma das tabelas. Abortando (nada foi alterado).');
      process.exit(1);
    }

    // Assumimos a primeira coluna candidata em cada tabela (tipicamente disciplina_id)
    const colItensMatriz = itensMatrizCols.includes('disciplina_id') ? 'disciplina_id' : itensMatrizCols[0];
    const colTurmaDisciplinas = turmaDisciplinasCols.includes('disciplina_id') ? 'disciplina_id' : turmaDisciplinasCols[0];
    console.log(`Usando itens_matriz.${colItensMatriz} e turma_disciplinas.${colTurmaDisciplinas}\n`);

    // --- Buscar as 248 disciplinas do Mário Braga ---
    const disciplinasRes = await client.query(
      `SELECT id, nome, codigo_sae, sigla, carga_semanal, categoria_curricular_padrao
       FROM disciplinas
       WHERE escola_id = $1
       ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    const disciplinas = disciplinasRes.rows;
    console.log(`Total de disciplinas do Mário Braga: ${disciplinas.length}\n`);

    // --- Buscar ids em uso em itens_matriz ---
    const usoItensMatrizRes = await client.query(
      `SELECT DISTINCT ${colItensMatriz} AS disciplina_id, COUNT(*) AS ocorrencias
       FROM itens_matriz
       WHERE ${colItensMatriz} IN (SELECT id FROM disciplinas WHERE escola_id = $1)
       GROUP BY ${colItensMatriz}`,
      [MARIO_BRAGA_ORG_ID]
    );
    const usoItensMatrizMap = new Map(usoItensMatrizRes.rows.map(r => [r.disciplina_id, Number(r.ocorrencias)]));

    // --- Buscar ids em uso em turma_disciplinas ---
    const usoTurmaDiscRes = await client.query(
      `SELECT DISTINCT ${colTurmaDisciplinas} AS disciplina_id, COUNT(*) AS ocorrencias
       FROM turma_disciplinas
       WHERE ${colTurmaDisciplinas} IN (SELECT id FROM disciplinas WHERE escola_id = $1)
       GROUP BY ${colTurmaDisciplinas}`,
      [MARIO_BRAGA_ORG_ID]
    );
    const usoTurmaDiscMap = new Map(usoTurmaDiscRes.rows.map(r => [r.disciplina_id, Number(r.ocorrencias)]));

    // --- Classificar ---
    const emUso = [];
    const candidatasCatalogo = [];

    for (const d of disciplinas) {
      const usoIM = usoItensMatrizMap.get(d.id) || 0;
      const usoTD = usoTurmaDiscMap.get(d.id) || 0;
      const registro = {
        id: d.id,
        nome: d.nome,
        codigo_sae: d.codigo_sae,
        sigla: d.sigla,
        carga_semanal: d.carga_semanal,
        categoria_curricular_padrao: d.categoria_curricular_padrao,
        ocorrencias_itens_matriz: usoIM,
        ocorrencias_turma_disciplinas: usoTD,
      };
      if (usoIM > 0 || usoTD > 0) {
        emUso.push(registro);
      } else {
        candidatasCatalogo.push(registro);
      }
    }

    console.log('=== RESULTADO ===');
    console.log(`Em uso (currículo real, ficam no Mário Braga): ${emUso.length}`);
    console.log(`Nunca referenciadas (candidatas ao catálogo SEED): ${candidatasCatalogo.length}`);
    console.log(`Total: ${emUso.length + candidatasCatalogo.length} (deve bater com ${disciplinas.length})\n`);

    console.log('--- Amostra: primeiras 20 EM USO ---');
    emUso.slice(0, 20).forEach(d => {
      console.log(`${d.id}\t${d.nome}\t(IM:${d.ocorrencias_itens_matriz} TD:${d.ocorrencias_turma_disciplinas})`);
    });

    console.log('\n--- Amostra: primeiras 20 CANDIDATAS AO CATÁLOGO ---');
    candidatasCatalogo.slice(0, 20).forEach(d => {
      console.log(`${d.id}\t${d.nome}\tcodigo_sae:${d.codigo_sae || '(vazio)'}`);
    });

    const outDir = __dirname;
    fs.writeFileSync(
      path.join(outDir, 'disciplinas-mario-braga-EM-USO.json'),
      JSON.stringify(emUso, null, 2)
    );
    fs.writeFileSync(
      path.join(outDir, 'disciplinas-mario-braga-CANDIDATAS-CATALOGO.json'),
      JSON.stringify(candidatasCatalogo, null, 2)
    );
    console.log('\nSalvo em:');
    console.log(' - disciplinas-mario-braga-EM-USO.json');
    console.log(' - disciplinas-mario-braga-CANDIDATAS-CATALOGO.json');
    console.log('\nNenhuma alteração foi feita no banco (script somente leitura).');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
