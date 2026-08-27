const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const rows = (await client.query(
      `SELECT id, professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria
       FROM disponibilidade_professores ORDER BY professor_id, dia_semana, horario_slot, id`
    )).rows;

    const grupos = new Map();
    for (const r of rows) {
      const chave = `${r.professor_id}-${r.dia_semana}-${r.horario_slot}-${r.turno}-${r.disponivel}-${r.hora_atividade_obrigatoria}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(r.id);
    }

    const idsParaRemover = [];
    for (const [, ids] of grupos.entries()) {
      if (ids.length > 1) idsParaRemover.push(...ids.slice(1)); // mantem o primeiro, remove o resto
    }

    console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}`);
    console.log(`Total de linhas: ${rows.length}`);
    console.log(`Grupos duplicados encontrados: ${[...grupos.values()].filter(g => g.length > 1).length}`);
    console.log(`Linhas duplicadas a remover: ${idsParaRemover.length}`);

    if (idsParaRemover.length === 0) { console.log('Nada a fazer.'); return; }

    if (APLICAR) {
      await client.query(`DELETE FROM disponibilidade_professores WHERE id = ANY($1)`, [idsParaRemover]);
      console.log(`Removidas ${idsParaRemover.length} linhas duplicadas.`);
    } else {
      console.log('DRY-RUN -- rode com --aplicar pra remover de fato.');
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
