/**
 * checar-uso-quase-duplicatas.cjs
 *
 * Script SOMENTE LEITURA.
 *
 * Para cada grupo de quase-duplicata do catálogo (mesmo nome-base,
 * codigo_sae diferente), verifica se alguma das duas escolas (Mário
 * Braga, Arlinda) já tem uma disciplina local com aquele codigo_sae
 * ou nome exato — ou seja, se aquela entrada específica do catálogo
 * já foi "puxada" via Adicionar do Catálogo por alguma escola.
 *
 * Isso ajuda a decidir: se só a versão "I" está em uso e a "base"
 * nunca foi usada por ninguém, é mais seguro considerar remover/
 * arquivar a base. Se as duas estão em uso, são cursos distintos
 * de fato e devem ser mantidos separados.
 *
 * Uso:
 *   node lib\db\checar-uso-quase-duplicatas.cjs
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

function removerAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normalizarBase(nome) {
  let s = removerAcentos(nome.toLowerCase()).trim();
  s = s.replace(/\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i, '');
  s = s.replace(/\s+\d+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const ESCOLAS = {
  'org_3HCMsuYeAwkggR1dxXNzEdzNaX8': 'Mário Braga',
  'org_3HCLFry0r48pfutN7ChZIip3IWL': 'Arlinda',
};

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  try {
    const catalogo = (await client.query('SELECT id, nome, codigo_sae FROM disciplinas_catalogo')).rows;
    const escolas = (await client.query('SELECT id, escola_id, nome, codigo_sae FROM disciplinas')).rows;

    // Agrupa catálogo por nome-base
    const grupos = new Map();
    for (const r of catalogo) {
      const base = normalizarBase(r.nome);
      if (!grupos.has(base)) grupos.set(base, []);
      grupos.get(base).push(r);
    }
    const suspeitos = [...grupos.entries()].filter(([, itens]) => itens.length > 1);

    log(`Grupos de quase-duplicata: ${suspeitos.length}\n`);

    for (const [base, itens] of suspeitos) {
      log(`Base: "${base}"`);
      for (const it of itens) {
        const usos = escolas.filter(
          (e) => (it.codigo_sae && e.codigo_sae === it.codigo_sae) || e.nome === it.nome
        );
        const usoStr = usos.length === 0
          ? 'NUNCA USADO por nenhuma escola'
          : usos.map((u) => `${ESCOLAS[u.escola_id] || u.escola_id} (id local ${u.id}, nome="${u.nome}")`).join('; ');
        log(`   catálogo id=${it.id}\tnome="${it.nome}"\tcodigo_sae=${it.codigo_sae ?? 'null'}\t-> ${usoStr}`);
      }
      log('');
    }

  } finally {
    await client.end();
    const relatorioPath = path.join(__dirname, 'uso-quase-duplicatas-relatorio.txt');
    fs.writeFileSync(relatorioPath, linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main();
