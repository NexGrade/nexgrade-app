// investigar-cursos-e-matrizes-duplicadas.cjs
// LEITURA APENAS — nenhuma escrita no banco.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

async function getColumns(client, tableName) {
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log('--- Colunas de cursos ---');
    const cursoCols = await getColumns(client, 'cursos');
    console.table(cursoCols);

    console.log('\n--- Todos os cursos do Mário Braga ---');
    const cursosRes = await client.query(
      `SELECT * FROM cursos WHERE escola_id = $1 ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.table(cursosRes.rows);
    console.log(`Total de cursos: ${cursosRes.rows.length}`);

    // Duplicatas de curso por nome
    const cursosPorNome = new Map();
    for (const c of cursosRes.rows) {
      const key = (c.nome || '').trim().toLowerCase();
      if (!cursosPorNome.has(key)) cursosPorNome.set(key, []);
      cursosPorNome.get(key).push(c);
    }
    const cursosDuplicados = [...cursosPorNome.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`\n--- Nomes de curso duplicados: ${cursosDuplicados.length} ---`);
    for (const [nome, arr] of cursosDuplicados) {
      console.log(`"${nome}": ids ${arr.map(c => c.id).join(', ')}`);
    }

    // --- Matrizes curriculares: duplicidade por (curso_id, serie_ano) ---
    console.log('\n\n--- Todas as 227 matrizes_curriculares do Mário Braga ---');
    const matrizesRes = await client.query(
      `SELECT mc.*, c.nome AS curso_nome
       FROM matrizes_curriculares mc
       LEFT JOIN cursos c ON c.id = mc.curso_id
       WHERE mc.escola_id = $1
       ORDER BY c.nome, mc.serie_ano`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Total: ${matrizesRes.rows.length}`);

    const porCursoSerie = new Map();
    for (const m of matrizesRes.rows) {
      const key = `${m.curso_id}||${m.serie_ano}`;
      if (!porCursoSerie.has(key)) porCursoSerie.set(key, []);
      porCursoSerie.get(key).push(m);
    }
    const duplicadas = [...porCursoSerie.entries()].filter(([_, arr]) => arr.length > 1);
    const unicas = [...porCursoSerie.entries()].filter(([_, arr]) => arr.length === 1);

    console.log(`\nCombinações (curso_id, serie_ano) únicas: ${unicas.length}`);
    console.log(`Combinações (curso_id, serie_ano) DUPLICADAS: ${duplicadas.length}`);

    console.log('\n--- Detalhe das combinações duplicadas ---');
    for (const [key, arr] of duplicadas) {
      console.log(`\n${arr[0].curso_nome || '(curso desconhecido)'} — ${arr[0].serie_ano}:`);
      for (const m of arr) {
        console.log(`  matriz id=${m.id}, carga_total=${m.carga_horaria_semanal_total}, created_at=${m.created_at}`);
      }
    }

    // Para cada matriz, contar quantos itens_matriz ela tem (para saber quais têm dados de verdade)
    console.log('\n\n--- Contagem de itens_matriz por matriz (todas as 227) ---');
    const contagemItensRes = await client.query(
      `SELECT matriz_curricular_id, COUNT(*) AS n
       FROM itens_matriz
       WHERE matriz_curricular_id IN (SELECT id FROM matrizes_curriculares WHERE escola_id = $1)
       GROUP BY matriz_curricular_id`,
      [MARIO_BRAGA_ORG_ID]
    );
    const contagemMap = new Map(contagemItensRes.rows.map(r => [r.matriz_curricular_id, Number(r.n)]));
    let comItens = 0, semItens = 0;
    for (const m of matrizesRes.rows) {
      if (contagemMap.has(m.id)) comItens++; else semItens++;
    }
    console.log(`Matrizes com pelo menos 1 item: ${comItens}`);
    console.log(`Matrizes sem nenhum item: ${semItens}`);

    // Salvar tudo para consulta posterior
    const outPath = path.join(__dirname, 'matrizes-mario-braga-completo.json');
    fs.writeFileSync(outPath, JSON.stringify({
      cursos: cursosRes.rows,
      cursosDuplicados,
      matrizes: matrizesRes.rows.map(m => ({ ...m, n_itens: contagemMap.get(m.id) || 0 })),
      combinacoesDuplicadas: duplicadas,
    }, null, 2));
    console.log(`\nSalvo em: ${outPath}`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
