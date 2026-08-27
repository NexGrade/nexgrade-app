// pente-fino-mario-braga.cjs
// LEITURA APENAS

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const ARLINDA_ORG_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';

function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normalizarTotal(nome) {
  return removerAcentos(nome.trim().toLowerCase()).replace(/\s+/g, ' ');
}

const PALAVRAS_DE_CORTE = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os',
  'para', 'no', 'na', 'nos', 'nas', 'com', 'ao', 'aos', 'à', 'às', 'ou',
  'que', 'se', 'por', 'sem', 'sob', 'sobre', 'entre', 'até', 'desde',
  'num', 'numa', 'nesse', 'nessa', 'neste', 'nesta', 'pelo', 'pela',
  'seu', 'sua', 'seus', 'suas', 'este', 'esta', 'esse', 'essa',
  'como', 'quando', 'onde', 'mas', 'porém', 'porem', 'ate',
]);

function ultimaPalavraETerminacao(nome) {
  const terminaComVirgula = /,\s*$/.test(nome.trim());
  const limpo = removerAcentos(nome.toLowerCase()).replace(/[.,]/g, '').trim();
  const partes = limpo.split(/\s+/);
  return { ultima: partes[partes.length - 1], terminaComVirgula };
}

const ROMANO_PARA_NUM = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
function extrairBaseNivel(nome) {
  const limpo = removerAcentos(nome.trim().toLowerCase()).replace(/[.,]/g, '').trim();
  const partes = limpo.split(/\s+/);
  const ultima = partes[partes.length - 1];
  if (/^\d+$/.test(ultima)) return { base: partes.slice(0, -1).join(' '), nivel: parseInt(ultima, 10) };
  if (ROMANO_PARA_NUM[ultima] !== undefined) return { base: partes.slice(0, -1).join(' '), nivel: ROMANO_PARA_NUM[ultima] };
  return { base: limpo, nivel: null };
}

async function rodarChecagens(client, escolaId, nomeEscola) {
    const todasRes = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 ORDER BY nome`,
      [escolaId]
    );
    console.log(`\n\n########## ${nomeEscola} — total: ${todasRes.rows.length} ##########\n`);

    console.log('=== 1. Duplicatas por nome (ignorando acento/maiúscula/espaço) ===');
    const porNome = new Map();
    for (const d of todasRes.rows) {
      const key = normalizarTotal(d.nome);
      if (!porNome.has(key)) porNome.set(key, []);
      porNome.get(key).push(d);
    }
    const dupNome = [...porNome.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`Grupos duplicados: ${dupNome.length}`);
    for (const [key, arr] of dupNome) {
      console.log(`\n"${key}":`);
      for (const d of arr) console.log(`  id=${d.id} nome="${d.nome}" codigo_sae=${d.codigo_sae || '(vazio)'}`);
    }

    console.log('\n=== 2. Nomes incompletos/truncados ===');
    const truncados = todasRes.rows.filter(d => {
      const { ultima, terminaComVirgula } = ultimaPalavraETerminacao(d.nome);
      return terminaComVirgula || PALAVRAS_DE_CORTE.has(ultima);
    });
    console.log(`Encontrados: ${truncados.length}`);
    console.table(truncados);

    console.log('\n=== 3. Conflito romano vs arábico (mesmo nível, convenção diferente) ===');
    const porBaseNivel = new Map();
    for (const d of todasRes.rows) {
      const { base, nivel } = extrairBaseNivel(d.nome);
      if (nivel === null) continue;
      const chave = `${base}||${nivel}`;
      if (!porBaseNivel.has(chave)) porBaseNivel.set(chave, []);
      porBaseNivel.get(chave).push(d);
    }
    const conflitosNumeral = [...porBaseNivel.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`Conflitos: ${conflitosNumeral.length}`);
    for (const [chave, arr] of conflitosNumeral) {
      console.log(`\n"${chave}":`);
      for (const d of arr) console.log(`  id=${d.id} nome="${d.nome}" codigo_sae=${d.codigo_sae || '(vazio)'}`);
    }

    // Bônus: listar todas as disciplinas que JÁ terminam em numeral, pra
    // ver rapidamente se essa escola usa romano, arábico, ou mistura.
    console.log('\n=== 4. Amostra de disciplinas com sufixo numeral (romano ou arábico) ===');
    const comSufixo = todasRes.rows.filter(d => extrairBaseNivel(d.nome).nivel !== null);
    console.log(`Total com sufixo numeral: ${comSufixo.length}`);
    console.table(comSufixo.slice(0, 30));

    return { dupNome, truncados, conflitosNumeral, comSufixo };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const resultadoMB = await rodarChecagens(client, MARIO_BRAGA_ORG_ID, 'MÁRIO BRAGA');
    const resultadoArlinda = await rodarChecagens(client, ARLINDA_ORG_ID, 'ARLINDA');

    fs.writeFileSync(
      path.join(__dirname, 'pente-fino-duas-escolas.json'),
      JSON.stringify({ marioBraga: resultadoMB, arlinda: resultadoArlinda }, null, 2)
    );
    console.log('\n\nSalvo em: pente-fino-duas-escolas.json');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
