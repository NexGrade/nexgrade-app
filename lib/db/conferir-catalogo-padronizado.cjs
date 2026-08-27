// conferir-catalogo-padronizado.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('=== 1. "Estratégi" no catálogo — singular, plural, ou os dois? ===');
    const estrategRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE nome ILIKE '%estratégi%marketing%'`
    );
    console.table(estrategRes.rows);

    console.log('\n=== 2. Recheck dos 6 padrões que padronizamos no Mário Braga/Arlinda ===');
    const nomesAlvo = [
      'Ciências (Fundamental)',
      'Língua Estrangeira Moderna - Inglês',
      'Língua Portuguesa e Literatura',
      'Recomposição da Aprendizagem - Matemática',
      'Leitura e Recomposição da Aprendizagem - Língua Portuguesa',
      'Estratégia de Marketing',
    ];
    for (const nome of nomesAlvo) {
      const r = await client.query(
        `SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE nome = $1`, [nome]
      );
      console.log(`"${nome}": ${r.rows.length > 0 ? 'EXISTE no catálogo (forma longa/antiga!) -> id ' + r.rows[0].id : 'não existe (ok)'}`);
    }

    console.log('\n=== 3. Total atual e duplicados de codigo_sae em disciplinas_catalogo ===');
    const totalRes = await client.query(`SELECT COUNT(*) FROM disciplinas_catalogo`);
    console.log(`Total: ${totalRes.rows[0].count}`);

    const todasRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas_catalogo WHERE codigo_sae IS NOT NULL`
    );
    const porCodigo = new Map();
    for (const d of todasRes.rows) {
      if (!porCodigo.has(d.codigo_sae)) porCodigo.set(d.codigo_sae, []);
      porCodigo.get(d.codigo_sae).push(d);
    }
    const duplicados = [...porCodigo.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`codigo_sae duplicados: ${duplicados.length}`);
    for (const [codigo, arr] of duplicados.slice(0, 30)) {
      console.log(`  ${codigo}: ${arr.map(d => `id=${d.id} "${d.nome}"`).join(' | ')}`);
    }
    if (duplicados.length > 30) console.log(`  ... e mais ${duplicados.length - 30}`);

    console.log('\n=== 4. As 17 disciplinas de Farmácia que inserimos — conferência ===');
    const farmaciaRes = await client.query(
      `SELECT id, nome, codigo_sae, created_at FROM disciplinas_catalogo
       WHERE nome ILIKE '%farmác%' OR nome ILIKE '%medicament%' OR nome = 'Coordenação' OR nome = 'Paee' OR nome = 'Projeto Integrador'
       ORDER BY created_at DESC LIMIT 25`
    );
    console.table(farmaciaRes.rows);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
