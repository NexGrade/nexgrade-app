const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const NOME_EXPERIMENTO = process.argv[2] || 'CPSAT-2026-08-15';
const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const rows = (await client.query(
      `SELECT professor_id, dia_semana, numero_aula FROM horarios_experimentais
       WHERE escola_id = $1 AND nome = $2`,
      [ESCOLA_ID, NOME_EXPERIMENTO]
    )).rows;

    if (rows.length === 0) { console.log('Nenhuma linha encontrada -- confere o nome do experimento.'); return; }

    const professores = (await client.query(`SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const profMap = new Map(professores.map(p => [p.id, p.nome]));

    // agrupa por professor+dia -> set de aulas ocupadas (aula real,
    // deduplicando co-docencia -- mais de um professor na mesma aula
    // conta como 1 slot ocupado por professor, nao duplica)
    const porProfDia = new Map();
    for (const r of rows) {
      const chave = `${r.professor_id}-${r.dia_semana}`;
      if (!porProfDia.has(chave)) porProfDia.set(chave, new Set());
      porProfDia.get(chave).add(r.numero_aula);
    }

    let totalJanelas = 0;
    const porProfessor = new Map();
    for (const [chave, aulasSet] of porProfDia.entries()) {
      const [profId] = chave.split('-');
      const aulas = [...aulasSet].sort((a, b) => a - b);
      if (aulas.length < 2) continue;
      const min = aulas[0], max = aulas[aulas.length - 1];
      let janelasNesseDia = 0;
      for (let a = min; a <= max; a++) {
        if (!aulasSet.has(a)) janelasNesseDia++;
      }
      if (janelasNesseDia > 0) {
        totalJanelas += janelasNesseDia;
        porProfessor.set(profId, (porProfessor.get(profId) ?? 0) + janelasNesseDia);
      }
    }

    console.log(`Experimento: ${NOME_EXPERIMENTO}`);
    console.log(`Total de janelas de professor (buracos no meio do dia): ${totalJanelas}\n`);

    if (porProfessor.size > 0) {
      console.log('Por professor:');
      const ordenado = [...porProfessor.entries()].sort((a, b) => b[1] - a[1]);
      for (const [profId, qtd] of ordenado) {
        console.log(`  ${profMap.get(Number(profId)) ?? profId}: ${qtd} janela(s)`);
      }
    } else {
      console.log('Nenhuma janela de professor encontrada -- zero buracos!');
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
