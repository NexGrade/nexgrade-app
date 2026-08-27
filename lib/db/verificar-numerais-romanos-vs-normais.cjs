// verificar-numerais-romanos-vs-normais.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const ROMANO_PARA_NUM = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

function extrairBaseNivel(nome) {
  const limpo = removerAcentos(nome.trim().toLowerCase()).replace(/[.,]/g, '').trim();
  const partes = limpo.split(/\s+/);
  const ultima = partes[partes.length - 1];

  if (/^\d+$/.test(ultima)) {
    return { base: partes.slice(0, -1).join(' '), nivel: parseInt(ultima, 10), tipoSufixo: 'arabico' };
  }
  if (ROMANO_PARA_NUM[ultima] !== undefined) {
    return { base: partes.slice(0, -1).join(' '), nivel: ROMANO_PARA_NUM[ultima], tipoSufixo: 'romano' };
  }
  return { base: limpo, nivel: null, tipoSufixo: null };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const todasRes = await client.query(`SELECT id, nome, codigo_sae FROM disciplinas_catalogo ORDER BY nome`);
    console.log(`Total de disciplinas: ${todasRes.rows.length}\n`);

    const porBaseNivel = new Map();
    for (const d of todasRes.rows) {
      const { base, nivel, tipoSufixo } = extrairBaseNivel(d.nome);
      if (nivel === null) continue;
      const chave = `${base}||${nivel}`;
      if (!porBaseNivel.has(chave)) porBaseNivel.set(chave, []);
      porBaseNivel.get(chave).push({ ...d, tipoSufixo });
    }

    const conflitos = [...porBaseNivel.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`=== Grupos com o MESMO nível representado por numeral romano E arábico (ou duplicado) ===`);
    console.log(`Total de conflitos: ${conflitos.length}\n`);
    for (const [chave, arr] of conflitos) {
      console.log(`"${chave}":`);
      for (const d of arr) {
        console.log(`  id=${d.id} nome="${d.nome}" codigo_sae=${d.codigo_sae || '(vazio)'} sufixo=${d.tipoSufixo}`);
      }
      console.log('');
    }

    fs.writeFileSync(
      path.join(__dirname, 'conflitos-numerais.json'),
      JSON.stringify(conflitos, null, 2)
    );
    console.log(`Salvo em: conflitos-numerais.json`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
