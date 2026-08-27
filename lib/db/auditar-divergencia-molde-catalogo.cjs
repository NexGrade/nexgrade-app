/**
 * auditar-divergencia-molde-catalogo.cjs
 *
 * Script SOMENTE LEITURA.
 *
 * Compara disciplinas_catalogo (733, fonte de verdade / modal "Adicionar
 * do Catálogo") com disciplinas WHERE escola_id='catalogo_geral' (371,
 * "molde" usado para popular itens_matriz de novos cursos).
 *
 * Cruza por codigo_sae (mais confiável). Reporta:
 *   A) Mesmo codigo_sae, nome diferente -> divergência a corrigir no molde
 *   B) codigo_sae do molde não existe no catálogo -> investigar
 *   C) Sem codigo_sae nos dois lados, nomes parecidos -> revisão manual
 *
 * Uso:
 *   node lib\db\auditar-divergencia-molde-catalogo.cjs
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
function normalizarNome(s) {
  return removerAcentos(s.toLowerCase()).replace(/\s+/g, ' ').trim();
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  try {
    const catalogo = (await client.query(
      'SELECT id, nome, codigo_sae FROM disciplinas_catalogo'
    )).rows;
    const molde = (await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = 'catalogo_geral'`
    )).rows;

    log(`Catálogo mestre: ${catalogo.length} disciplinas`);
    log(`Molde (catalogo_geral): ${molde.length} disciplinas\n`);

    const catalogoPorSae = new Map();
    for (const c of catalogo) {
      if (c.codigo_sae) catalogoPorSae.set(c.codigo_sae, c);
    }
    const catalogoPorNome = new Map();
    for (const c of catalogo) {
      catalogoPorNome.set(normalizarNome(c.nome), c);
    }

    const divergentes = [];
    const semCorrespondenciaSae = [];
    const semSaeNosDois = [];
    const identicos = [];

    for (const m of molde) {
      if (m.codigo_sae && catalogoPorSae.has(m.codigo_sae)) {
        const c = catalogoPorSae.get(m.codigo_sae);
        if (c.nome !== m.nome) {
          divergentes.push({ molde: m, catalogo: c });
        } else {
          identicos.push(m);
        }
      } else if (m.codigo_sae) {
        semCorrespondenciaSae.push(m);
      } else {
        // sem codigo_sae no molde — tenta por nome normalizado
        const porNome = catalogoPorNome.get(normalizarNome(m.nome));
        if (porNome) {
          if (porNome.nome !== m.nome) {
            divergentes.push({ molde: m, catalogo: porNome });
          } else {
            identicos.push(m);
          }
        } else {
          semSaeNosDois.push(m);
        }
      }
    }

    log(`=== A. Mesmo codigo_sae (ou nome normalizado), nome DIFERENTE: ${divergentes.length} ===`);
    for (const d of divergentes) {
      log(`molde id=${d.molde.id}\t"${d.molde.nome}"\tcodigo_sae=${d.molde.codigo_sae ?? 'null'}\t-> catálogo id=${d.catalogo.id}\t"${d.catalogo.nome}"`);
    }

    log(`\n=== B. codigo_sae do molde NÃO existe no catálogo mestre: ${semCorrespondenciaSae.length} ===`);
    for (const m of semCorrespondenciaSae) {
      log(`molde id=${m.id}\t"${m.nome}"\tcodigo_sae=${m.codigo_sae}`);
    }

    log(`\n=== C. Sem codigo_sae e sem match por nome: ${semSaeNosDois.length} ===`);
    for (const m of semSaeNosDois) {
      log(`molde id=${m.id}\t"${m.nome}"`);
    }

    log(`\n=== Resumo ===`);
    log(`Idênticos (nada a fazer): ${identicos.length}`);
    log(`Divergentes (corrigir nome no molde): ${divergentes.length}`);
    log(`Sem correspondência por SAE: ${semCorrespondenciaSae.length}`);
    log(`Sem SAE nos dois lados: ${semSaeNosDois.length}`);

  } finally {
    await client.end();
    const relatorioPath = path.join(__dirname, 'divergencia-molde-catalogo-relatorio.txt');
    fs.writeFileSync(relatorioPath, linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main();
