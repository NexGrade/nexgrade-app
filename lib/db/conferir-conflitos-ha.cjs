const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync('.env', 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const ESCOLA_ID = process.argv[2] || 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    console.log(`Conferindo conflitos HA x aula real -- escola=${ESCOLA_ID}\n`);

    const professores = (await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID]
    )).rows;
    const profMap = new Map(professores.map(p => [p.id, p.nome]));
    const profIds = professores.map(p => p.id);

    const haRows = (await client.query(
      `SELECT professor_id, dia_semana, horario_slot, turno FROM disponibilidade_professores
       WHERE professor_id = ANY($1) AND hora_atividade_obrigatoria = true`,
      [profIds]
    )).rows;

    const turmas = (await client.query(`SELECT id, turno FROM turmas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const turnoPorTurma = new Map(turmas.map(t => [t.id, t.turno]));

    const aulas = (await client.query(
      `SELECT professor_id, turma_id, dia_semana, numero_aula, disciplina_id FROM horarios WHERE escola_id = $1`,
      [ESCOLA_ID]
    )).rows;

    let conflitos = 0;
    for (const ha of haRows) {
      const aulaConflitante = aulas.find(a =>
        a.professor_id === ha.professor_id &&
        a.dia_semana === ha.dia_semana &&
        a.numero_aula === ha.horario_slot &&
        (ha.turno == null || turnoPorTurma.get(a.turma_id) === ha.turno)
      );
      if (aulaConflitante) {
        conflitos++;
        console.log(`  CONFLITO: ${profMap.get(ha.professor_id)} -- dia=${ha.dia_semana} aula=${ha.horario_slot} (turno HA: ${ha.turno ?? 'qualquer'}) TEM aula real marcada (turma_id=${aulaConflitante.turma_id})`);
      }
    }

    console.log(`\nTotal de HA marcadas: ${haRows.length}`);
    console.log(`Total de conflitos (aula real em cima de HA): ${conflitos}`);
    if (conflitos === 0) console.log('\nTudo certo -- nenhuma aula real esta em cima de HA.');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
