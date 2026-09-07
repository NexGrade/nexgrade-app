const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const NOME_GRADE = 'CPSAT-2026-09-05 - Matutino 02:10';
const TURNO = 'matutino';

function calcularHA(aulasSemana) {
  const tabela = [
    [1,2,0], [3,4,1], [5,8,2], [9,10,3], [11,14,4], [15,17,5],
    [18,20,6], [21,23,7], [24,26,8], [27,28,9], [29,30,10],
  ];
  for (const [min, max, ha] of tabela) if (aulasSemana >= min && aulasSemana <= max) return ha;
  if (aulasSemana === 0) return 0;
  return 10;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const aulas = (await c.query(
    `SELECT p.id AS professor_id, p.nome AS professor, h.dia_semana AS dia, h.numero_aula AS aula
     FROM horarios_experimentais h JOIN professores p ON p.id = h.professor_id
     WHERE h.escola_id = $1 AND h.nome = $2`,
    [ESCOLA_ID, NOME_GRADE]
  )).rows;

  const bloqueios = (await c.query(
    `SELECT professor_id, dia_semana AS dia, horario_slot AS aula
     FROM disponibilidade_professores WHERE turno = $1 AND disponivel = false`,
    [TURNO]
  )).rows;

  const maxAulaSlot = (await c.query(
    `SELECT MAX(numero_aula) AS max FROM horario_slots WHERE escola_id = $1 AND turno = $2 AND letivo = true`,
    [ESCOLA_ID, TURNO]
  )).rows[0].max;

  const porProf = new Map();
  for (const a of aulas) {
    if (!porProf.has(a.professor_id)) porProf.set(a.professor_id, { nome: a.professor, aulasPorDia: new Map() });
    const p = porProf.get(a.professor_id);
    if (!p.aulasPorDia.has(a.dia)) p.aulasPorDia.set(a.dia, new Set());
    p.aulasPorDia.get(a.dia).add(a.aula);
  }
  const bloqueiosPorProf = new Map();
  for (const b of bloqueios) {
    if (!bloqueiosPorProf.has(b.professor_id)) bloqueiosPorProf.set(b.professor_id, new Map());
    const m = bloqueiosPorProf.get(b.professor_id);
    if (!m.has(b.dia)) m.set(b.dia, new Set());
    m.get(b.dia).add(b.aula);
  }

  const propostas = [];
  const resumo = [];

  for (const [profId, info] of porProf) {
    const totalAulas = [...info.aulasPorDia.values()].reduce((s, set) => s + set.size, 0);
    const haNecessaria = calcularHA(totalAulas);
    if (haNecessaria === 0) continue;

    const bloqDias = bloqueiosPorProf.get(profId) ?? new Map();

    const candidatosP1 = [];
    const candidatosP2 = [];
    const candidatosP3 = [];

    for (let dia = 0; dia < 5; dia++) {
      const ocupadas = info.aulasPorDia.get(dia) ?? new Set();
      const bloqueadas = bloqDias.get(dia) ?? new Set();
      const livre = (aula) => aula >= 1 && aula <= maxAulaSlot && !ocupadas.has(aula) && !bloqueadas.has(aula);

      if (ocupadas.size > 0) {
        const min = Math.min(...ocupadas), max = Math.max(...ocupadas);
        for (let a = min; a <= max; a++) if (!ocupadas.has(a) && livre(a)) candidatosP1.push({ dia, aula: a });
        for (let a = min - 1; a >= 1; a--) {
          if (!livre(a)) break;
          candidatosP2.push({ dia, aula: a });
        }
        for (let a = max + 1; a <= maxAulaSlot; a++) {
          if (!livre(a)) break;
          candidatosP2.push({ dia, aula: a });
        }
      } else {
        for (let a = 1; a <= maxAulaSlot; a++) if (livre(a)) candidatosP3.push({ dia, aula: a });
      }
    }

    const MAX_HA_POR_DIA = 3;
    const candidatosOrdenados = [...candidatosP1, ...candidatosP2, ...candidatosP3];
    const contagemPorDia = {};
    const escolhidos = [];
    for (const cand of candidatosOrdenados) {
      if (escolhidos.length >= haNecessaria) break;
      const atual = contagemPorDia[cand.dia] ?? 0;
      if (atual >= MAX_HA_POR_DIA) continue;
      escolhidos.push(cand);
      contagemPorDia[cand.dia] = atual + 1;
    }
    // Segunda passada (relaxada): se ainda faltar depois de respeitar
    // o limite por dia, permite exceder -- melhor um dia um pouco mais
    // cheio do que deixar HA sem alocar de jeito nenhum.
    if (escolhidos.length < haNecessaria) {
      for (const cand of candidatosOrdenados) {
        if (escolhidos.length >= haNecessaria) break;
        if (escolhidos.includes(cand)) continue;
        escolhidos.push(cand);
      }
    }
    const faltou = haNecessaria - escolhidos.length;

    resumo.push({
      professor: info.nome, totalAulas, haNecessaria,
      fechouBuracos: Math.min(candidatosP1.length, haNecessaria),
      usouPontas: Math.max(0, Math.min(escolhidos.length, candidatosP1.length + candidatosP2.length) - candidatosP1.length),
      usouDiaSemAula: Math.max(0, escolhidos.length - candidatosP1.length - candidatosP2.length),
      faltou,
    });

    for (const e of escolhidos) propostas.push({ professor_id: profId, professor: info.nome, dia: e.dia, aula: e.aula });
  }

  console.log('Total de HA a inserir/atualizar:', propostas.length);
  const comFalta = resumo.filter(r => r.faltou > 0);
  console.log('Professores com FALTOU > 0:', comFalta.length, '| Total de horas faltantes:', comFalta.reduce((s,r)=>s+r.faltou,0));
  console.table(comFalta.map(r => ({ professor: r.professor, haNecessaria: r.haNecessaria, faltou: r.faltou })));

  if (APLICAR) {
    await c.query('BEGIN');
    for (const p of propostas) {
      await c.query(
        `INSERT INTO disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
         VALUES ($1, $2, $3, $4, true, true, 'HA calculada automaticamente (regra SEED 15/5 + minimizacao de janela, prioridade pontas do dia)')
         ON CONFLICT (professor_id, dia_semana, horario_slot, turno)
         DO UPDATE SET disponivel = true, hora_atividade_obrigatoria = true, motivo = EXCLUDED.motivo`,
        [p.professor_id, p.dia, p.aula, TURNO]
      );
    }
    await c.query('COMMIT');
    console.log('APLICADO:', propostas.length, 'linhas de HA inseridas/atualizadas.');
  } else {
    console.log('DRY-RUN -- nada foi gravado. Rode com --aplicar para gravar.');
  }

  await c.end();
}
main().catch(async (e) => { console.error(e); process.exitCode = 1; });
