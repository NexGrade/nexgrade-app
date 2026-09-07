/**
 * montar-payload-direto-por-nivel.cjs
 * Monta o payload real do CP-SAT pegando as turmas diretamente da tabela
 * `turmas` (nao depende de um experimento ja salvo -- util quando a etapa
 * falhou antes de gravar, como medio_tecnico apos INFEASIBLE).
 *
 * Uso:
 *   node montar-payload-direto-por-nivel.cjs --nivel=medio_tecnico --tempoLimiteS=300
 *   node montar-payload-direto-por-nivel.cjs --nivel=fundamental --tempoLimiteS=300
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const TURNO = 'matutino';

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return { nivel: args.nivel ?? null, tempoLimiteS: Number(args.tempoLimiteS ?? 900) };
}

async function main() {
  const { nivel, tempoLimiteS } = parseArgs();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const filtroNivel = nivel === 'medio_tecnico'
      ? `nivel_ensino IS NOT NULL AND nivel_ensino != 'fundamental'`
      : `nivel_ensino = 'fundamental'`;

    const turmasDoTurno = (await c.query(
      `SELECT id, nome, turno, nivel_ensino, matriz_curricular_id FROM turmas
       WHERE escola_id = $1 AND turno = $2 AND fantasma = false AND ${filtroNivel}`,
      [ESCOLA_ID, TURNO]
    )).rows;
    const turmaIds = turmasDoTurno.map(t => t.id);
    console.log(`Turmas encontradas (${nivel}): ${turmasDoTurno.length}`, turmasDoTurno.map(t => t.nome));

    const matrizIdsAlvo = [...new Set(turmasDoTurno.map((t) => t.matriz_curricular_id).filter((id) => id != null))];
    const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos, itensMatrizTodos, configGeminadas] =
      [
        await c.query(`SELECT * FROM turma_disciplinas WHERE turma_id = ANY($1)`, [turmaIds]).then((r) => r.rows),
        await c.query(`SELECT * FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID]).then((r) => r.rows),
        await c.query(`SELECT * FROM professores WHERE escola_id = $1`, [ESCOLA_ID]).then((r) => r.rows),
        await c.query(`SELECT * FROM disponibilidade_professores`).then((r) => r.rows),
        await c.query(`SELECT * FROM horario_slots WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID, TURNO]).then((r) => r.rows),
        await c.query(`SELECT * FROM professor_disciplinas`).then((r) => r.rows),
        matrizIdsAlvo.length > 0
          ? await c.query(`SELECT * FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`, [matrizIdsAlvo]).then((r) => r.rows)
          : [],
        await c.query(
          `SELECT valor FROM configuracoes WHERE escola_id = $1 AND chave = 'seed_pr.max_aulas_geminadas_padrao'`,
          [ESCOLA_ID]
        ).then((r) => r.rows[0]?.valor),
      ];
    const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));
    const itensMatrizMap = new Map(itensMatrizTodos.map((im) => [`${im.matriz_curricular_id}-${im.disciplina_id}`, im]));
    const professorMap = new Map(professoresTodos.map((p) => [p.id, p]));
    const turmaMap = new Map(turmasDoTurno.map((t) => [t.id, t]));
    const nomeParaProfessorId = new Map(professoresTodos.map((p) => [p.nome, p.id]));
    function resolverProfessor(td, turma) {
      if (td.professor_id != null) return professorMap.get(td.professor_id) ?? null;
      const candidatos = profDiscsTodos
        .filter((pd) => pd.disciplina_id === td.disciplina_id)
        .map((pd) => professorMap.get(pd.professor_id))
        .filter((p) => p != null);
      return candidatos.find((p) => p.nome.includes(`(${turma.nome})`)) ?? null;
    }
    const maxGeminadasPadraoCpsat = typeof configGeminadas === 'number' ? configGeminadas : 2;
    const maxAulaPorNivelEnsino = new Map();
    for (const slot of horarioSlotsTurno) {
      if (!slot.letivo) continue;
      const chave = slot.nivel_ensino ?? '__sem_nivel__';
      const atual = maxAulaPorNivelEnsino.get(chave) ?? 0;
      if (slot.numero_aula > atual) maxAulaPorNivelEnsino.set(chave, slot.numero_aula);
    }
    let maxAulaGlobalFallback = 0;
    for (const v of maxAulaPorNivelEnsino.values()) if (v > maxAulaGlobalFallback) maxAulaGlobalFallback = v;
    const disciplinasTurma = turmaDiscsTodos
      .map((td) => {
        const turma = turmaMap.get(td.turma_id);
        const disc = disciplinaMap.get(td.disciplina_id);
        const prof = resolverProfessor(td, turma);
        if (!prof) return null;
        const codigoSae = disc?.codigo_sae ?? disc?.sigla ?? String(td.disciplina_id);
        return {
          turma: turma.nome,
          codigoSae,
          nome: disc?.nome ?? `Disciplina #${td.disciplina_id}`,
          aulasSemana:
            td.carga_horaria_semanal_override ??
            itensMatrizMap.get(`${turma.matriz_curricular_id}-${td.disciplina_id}`)?.carga_horaria_semanal ??
            disc?.carga_semanal ?? 0,
          professor: prof.nome,
          maxAulasDia: td.max_aulas_consecutivas_dia ?? maxGeminadasPadraoCpsat,
          ultimaAulaTurma: maxAulaPorNivelEnsino.get(turma.nivel_ensino ?? '__sem_nivel__') ?? maxAulaGlobalFallback,
        };
      })
      .filter((d) => d !== null)
      .filter((d) => d.aulasSemana > 0);
    const professorIdsUsados = new Set(
      disciplinasTurma.map((d) => nomeParaProfessorId.get(d.professor)).filter((id) => id != null)
    );
    const bloqueiosProfessor = disponibilidades
      .filter((d) =>
        professorIdsUsados.has(d.professor_id) &&
        (!d.disponivel || d.hora_atividade_obrigatoria) &&
        (d.turno === TURNO || d.turno == null)
      )
      .map((d) => ({
        professor: professorMap.get(d.professor_id)?.nome ?? `Professor #${d.professor_id}`,
        dia: d.dia_semana,
        aula: d.horario_slot,
      }));
    const aulasPorDia = horarioSlotsTurno.length > 0
      ? Math.max(...horarioSlotsTurno.map((s) => s.numero_aula))
      : 6;
    const payload = {
      turno: TURNO,
      aulasPorDia,
      turmas: turmasDoTurno.map((t) => ({ nome: t.nome, turno: t.turno })),
      disciplinasTurma,
      bloqueiosProfessor,
      tempoLimiteS,
    };
    const outName = `payload-${nivel}-direto.json`;
    fs.writeFileSync(outName, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Payload salvo em ${outName}`);
    console.log(`  ${turmasDoTurno.length} turmas, ${disciplinasTurma.length} linhas turma-disciplina, ${professorIdsUsados.size} professores, ${bloqueiosProfessor.length} bloqueios (bloqueio + HA)`);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
