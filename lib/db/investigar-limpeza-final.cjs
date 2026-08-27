// investigar-limpeza-final.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // --- 1. As 227 matrizes antigas: alguma turma ainda aponta pra elas? ---
    console.log('=== 1. Matrizes antigas (id < 519) — alguma turma ainda vinculada? ===');
    const antigasRes = await client.query(
      `SELECT id FROM matrizes_curriculares WHERE escola_id = $1 AND id < 519`,
      [MARIO_BRAGA_ORG_ID]
    );
    const idsAntigas = antigasRes.rows.map(r => r.id);
    console.log(`Total de matrizes antigas: ${idsAntigas.length}`);

    const aindaVinculadasRes = await client.query(
      `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND matriz_curricular_id = ANY($2)`,
      [MARIO_BRAGA_ORG_ID, idsAntigas]
    );
    console.log(`Turmas ainda vinculadas a matrizes antigas: ${aindaVinculadasRes.rows.length} (esperado: 0)`);
    console.table(aindaVinculadasRes.rows);

    const itensAntigosRes = await client.query(
      `SELECT COUNT(*) FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`,
      [idsAntigas]
    );
    console.log(`itens_matriz remanescentes nas matrizes antigas: ${itensAntigosRes.rows[0].count}`);

    // --- 2. Sobreposição entre catalogo_disciplinas_seed e disciplinas_catalogo ---
    console.log('\n\n=== 2. catalogo_disciplinas_seed (150) vs disciplinas_catalogo (772) ===');
    const seedRes = await client.query(`SELECT id, nome, codigo_sae FROM catalogo_disciplinas_seed`);
    console.log(`Total em catalogo_disciplinas_seed: ${seedRes.rows.length}`);

    const catalogoRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas_catalogo`);
    const codigosCatalogo = new Set(catalogoRes.rows.map(r => r.codigo_sae).filter(Boolean));
    const nomesCatalogo = new Set(catalogoRes.rows.map(r => r.nome.trim().toLowerCase()));

    let jaExisteNoCatalogo = 0;
    let naoExisteNoCatalogo = [];
    for (const s of seedRes.rows) {
      const existePorCodigo = s.codigo_sae && codigosCatalogo.has(s.codigo_sae);
      const existePorNome = nomesCatalogo.has((s.nome || '').trim().toLowerCase());
      if (existePorCodigo || existePorNome) {
        jaExisteNoCatalogo++;
      } else {
        naoExisteNoCatalogo.push(s);
      }
    }
    console.log(`Das 150 em catalogo_disciplinas_seed, já existem em disciplinas_catalogo: ${jaExisteNoCatalogo}`);
    console.log(`NÃO existem em disciplinas_catalogo (precisariam ser inseridas): ${naoExisteNoCatalogo.length}`);
    if (naoExisteNoCatalogo.length > 0) {
      console.table(naoExisteNoCatalogo);
    }

    // --- 3. disciplinas_catalogo: quantas têm nomes no estilo "longo" que padronizamos? ---
    console.log('\n\n=== 3. disciplinas_catalogo — candidatos a padronização de nome (heurística) ===');
    const padroesLongos = [
      '%(Fundamental)%', '%Língua Estrangeira Moderna%', '% e Literatura%',
      'Recomposição da Aprendizagem%', 'Leitura e Recomposição%',
    ];
    for (const padrao of padroesLongos) {
      const r = await client.query(
        `SELECT id, nome FROM disciplinas_catalogo WHERE nome ILIKE $1 LIMIT 10`,
        [padrao]
      );
      if (r.rows.length > 0) {
        console.log(`\nPadrão "${padrao}":`);
        console.table(r.rows);
      }
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
