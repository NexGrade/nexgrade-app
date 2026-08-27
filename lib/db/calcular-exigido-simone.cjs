const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const TABELA_OFICIAL_HA = [
  0,
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 6, 6, 6,
  7, 7, 7, 8, 8, 8, 9, 9, 10, 10,
];
function calcularExigido(aulas) {
  if (!aulas || aulas <= 0) return 0;
  if (aulas <= 30) return TABELA_OFICIAL_HA[Math.round(aulas)];
  return Math.ceil(aulas / 3);
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const [prof] = (await client.query(`SELECT id, nome FROM professores WHERE nome = 'Simone' AND escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'`)).rows;

    const horarios = (await client.query(`SELECT turma_id FROM horarios WHERE professor_id = $1`, [prof.id])).rows;
    const turmaIds = [...new Set(horarios.map(h => h.turma_id))];
    const turmas = turmaIds.length > 0
      ? (await client.query(`SELECT id, turno FROM turmas WHERE id = ANY($1)`, [turmaIds])).rows
      : [];
    const turnoPorTurma = new Map(turmas.map(t => [t.id, t.turno]));

    const aulasPorTurno = {};
    for (const h of horarios) {
      const turno = turnoPorTurma.get(h.turma_id);
      aulasPorTurno[turno] = (aulasPorTurno[turno] ?? 0) + 1;
    }
    const totalAulas = Object.values(aulasPorTurno).reduce((s, n) => s + n, 0);
    const exigidoTotal = calcularExigido(totalAulas);

    const haAtual = (await client.query(
      `SELECT COUNT(*) AS total FROM disponibilidade_professores WHERE professor_id = $1 AND hora_atividade_obrigatoria = true`,
      [prof.id]
    )).rows[0].total;

    console.log(`Aulas por turno:`, aulasPorTurno);
    console.log(`Total de aulas (todos os turnos): ${totalAulas}`);
    console.log(`HA exigida (formula oficial SEED-PR): ${exigidoTotal}`);
    console.log(`HA marcada hoje no banco: ${haAtual}`);
    console.log(`Diferenca: ${exigidoTotal - haAtual}`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
