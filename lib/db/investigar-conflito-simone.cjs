const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const [prof] = (await client.query(`SELECT id, nome FROM professores WHERE nome = 'Simone' AND escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'`)).rows;
    const rows = (await client.query(
      `SELECT id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo
       FROM disponibilidade_professores WHERE professor_id = $1 ORDER BY turno, dia_semana, horario_slot`,
      [prof.id]
    )).rows;

    const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'];
    const grupos = new Map();
    for (const r of rows) {
      const chave = `${r.turno}-${r.dia_semana}-${r.horario_slot}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(r);
    }

    console.log(`Celulas com MAIS DE UM registro (conflito real, mesmo horario com tipos diferentes):\n`);
    let conflitos = 0;
    for (const [chave, regs] of grupos.entries()) {
      if (regs.length <= 1) continue;
      conflitos++;
      const [turno, dia, aula] = chave.split('-');
      console.log(`  ${turno} ${DIAS[Number(dia)]} aula ${aula}:`);
      for (const r of regs) {
        const tipo = !r.disponivel ? 'BLOQUEIO' : (r.hora_atividade_obrigatoria ? 'HA' : 'disponivel');
        console.log(`      id=${r.id} tipo=${tipo} motivo="${r.motivo ?? ''}"`);
      }
    }
    console.log(`\nTotal de celulas em conflito: ${conflitos}`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
