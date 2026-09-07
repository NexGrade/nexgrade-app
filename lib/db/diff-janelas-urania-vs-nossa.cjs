const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const NOME_NOSSA = 'CPSAT-2026-09-05 - Matutino 00:36';

function acharBuracos(linhas, chaveFn) {
  const porGrupoDia = new Map();
  for (const l of linhas) {
    const chave = `${chaveFn(l)}::${l.dia}`;
    if (!porGrupoDia.has(chave)) porGrupoDia.set(chave, new Set());
    porGrupoDia.get(chave).add(l.aula);
  }
  const contagem = new Map();
  for (const [chave, aulas] of porGrupoDia) {
    if (aulas.size < 2) continue;
    const [grupo] = chave.split('::');
    const min = Math.min(...aulas);
    const max = Math.max(...aulas);
    let buracos = 0;
    for (let a = min; a <= max; a++) if (!aulas.has(a)) buracos++;
    if (buracos > 0) contagem.set(grupo, (contagem.get(grupo) ?? 0) + buracos);
  }
  return contagem;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const urania = (await c.query(
    `SELECT p.nome AS professor, h.dia_semana AS dia, h.numero_aula AS aula
     FROM horarios h JOIN turmas t ON t.id = h.turma_id JOIN professores p ON p.id = h.professor_id
     WHERE h.escola_id = $1 AND t.turno = 'matutino'`,
    [ESCOLA_ID]
  )).rows;

  const nossa = (await c.query(
    `SELECT p.nome AS professor, h.dia_semana AS dia, h.numero_aula AS aula
     FROM horarios_experimentais h JOIN professores p ON p.id = h.professor_id
     WHERE h.escola_id = $1 AND h.nome = $2`,
    [ESCOLA_ID, NOME_NOSSA]
  )).rows;

  const jUrania = acharBuracos(urania, (l) => l.professor);
  const jNossa = acharBuracos(nossa, (l) => l.professor);

  const todosProfs = new Set([...jUrania.keys(), ...jNossa.keys()]);
  const diffs = [...todosProfs].map(p => ({
    professor: p,
    urania: jUrania.get(p) ?? 0,
    nossa: jNossa.get(p) ?? 0,
    diff: (jNossa.get(p) ?? 0) - (jUrania.get(p) ?? 0),
  })).sort((a, b) => b.diff - a.diff);

  console.log('Professor | Urania | Nossa | Diferenca (nossa - urania)');
  for (const d of diffs) {
    if (d.diff !== 0) console.log(`${d.professor} | ${d.urania} | ${d.nossa} | ${d.diff > 0 ? '+' : ''}${d.diff}`);
  }

  const piores = diffs.filter(d => d.diff > 0);
  const melhores = diffs.filter(d => d.diff < 0);
  console.log('\nResumo:');
  console.log('Professores PIOR que Urania:', piores.length, '| total de janelas extras:', piores.reduce((s, d) => s + d.diff, 0));
  console.log('Professores MELHOR que Urania:', melhores.length, '| total de janelas a menos:', melhores.reduce((s, d) => s + Math.abs(d.diff), 0));
  console.log('Professores IGUAIS:', diffs.length - piores.length - melhores.length);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
