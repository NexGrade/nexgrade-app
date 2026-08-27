const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const [prof] = (await client.query(`SELECT id, nome FROM professores WHERE nome = 'Simone' AND escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'`)).rows;
    if (!prof) { console.log('Professora Simone nao encontrada.'); return; }

    const disp = (await client.query(
      `SELECT dia_semana, horario_slot, disponivel, hora_atividade_obrigatoria, turno, motivo
       FROM disponibilidade_professores WHERE professor_id = $1 AND (turno = 'matutino' OR turno IS NULL)
       ORDER BY dia_semana, horario_slot`,
      [prof.id]
    )).rows;

    console.log(`Disponibilidade da professora Simone (id=${prof.id}) -- turno matutino:\n`);
    for (const d of disp) {
      const tipo = !d.disponivel ? 'BLOQUEIO' : (d.hora_atividade_obrigatoria ? 'HA' : '(disponivel, sem marcacao)');
      console.log(`  ${DIAS[d.dia_semana]} aula ${d.horario_slot}: ${tipo}${d.motivo ? ` -- ${d.motivo}` : ''}`);
    }

    const bloqueios = disp.filter(d => !d.disponivel).length;
    const has = disp.filter(d => d.hora_atividade_obrigatoria).length;
    console.log(`\nTotal bloqueios: ${bloqueios}`);
    console.log(`Total HA: ${has}`);
    console.log(`Total consumido: ${bloqueios + has} de 30 slots/semana`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
