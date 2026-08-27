/**
 * diagnosticar-sobrecarga-professores.cjs
 * Script SOMENTE LEITURA.
 *
 * Reusa a mesma montagem de payload de teste-carga-cpsat-real.cjs, mas
 * em vez de mandar pro solver, verifica se algum professor ficou
 * matematicamente SOBRECARREGADO:
 *
 *   1) demanda (soma de aulasSemana em todas as turmas que ele pegou)
 *      > TETO_AULAS_TURNO (24 no matutino/vespertino, 19 no noturno)
 *      -- viola a RESTRICAO 4 (teto SEED-PR), problema literalmente
 *      impossivel de resolver, nao so dificil.
 *
 *   2) demanda > slots disponiveis pra ele nesse turno (aulasPorDia*5
 *      menos os horarios em que ele esta bloqueado/indisponivel)
 *      -- mesma coisa, impossivel matematicamente.
 *
 * Tambem reporta os professores mais "apertados" (perto do limite),
 * mesmo sem violar -- esses sao os que mais pesam na dificuldade do
 * solver, ainda que tecnicamente resolviveis.
 *
 * Uso:
 *   node diagnosticar-sobrecarga-professores.cjs
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID_MARIO_BRAGA = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const TURNO = 'matutino';
const TETO_AULAS_TURNO = { noturno: 19, matutino: 24, vespertino: 24 };

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  try {
    const turmasDoTurno = (await client.query(
      `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND turno = $2`,
      [ESCOLA_ID_MARIO_BRAGA, TURNO]
    )).rows;
    const turmaIds = turmasDoTurno.map((t) => t.id);
    const matrizIdsAlvo = [...new Set(turmasDoTurno.map((t) => t.matriz_curricular_id).filter((id) => id != null))];

    const turmaDiscsTodos = (await client.query(`SELECT * FROM turma_disciplinas WHERE turma_id = ANY($1)`, [turmaIds])).rows;
    const disciplinas = (await client.query(`SELECT * FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID_MARIO_BRAGA])).rows;
    const professoresTodos = (await client.query(`SELECT * FROM professores WHERE escola_id = $1`, [ESCOLA_ID_MARIO_BRAGA])).rows;
    const disponibilidades = (await client.query(`SELECT * FROM disponibilidade_professores`)).rows;
    const horarioSlotsTurno = (await client.query(`SELECT * FROM horario_slots WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID_MARIO_BRAGA, TURNO])).rows;
    const profDiscsTodos = (await client.query(`SELECT * FROM professor_disciplinas`)).rows;
    const itensMatrizTodos = matrizIdsAlvo.length > 0
      ? (await client.query(`SELECT * FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`, [matrizIdsAlvo])).rows
      : [];

    const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));
    const itensMatrizMap = new Map(itensMatrizTodos.map((im) => [`${im.matriz_curricular_id}-${im.disciplina_id}`, im]));
    const professorMap = new Map(professoresTodos.map((p) => [p.id, p]));
    const turmaMap = new Map(turmasDoTurno.map((t) => [t.id, t]));

    function resolverProfessor(td, turma) {
      if (td.professor_id != null) return professorMap.get(td.professor_id) ?? null;
      const candidatos = profDiscsTodos
        .filter((pd) => pd.disciplina_id === td.disciplina_id)
        .map((pd) => professorMap.get(pd.professor_id))
        .filter((p) => p != null);
      return candidatos.find((p) => p.nome.includes(`(${turma.nome})`)) ?? null;
    }

    const disciplinasTurma = turmaDiscsTodos
      .map((td) => {
        const turma = turmaMap.get(td.turma_id);
        const disc = disciplinaMap.get(td.disciplina_id);
        const prof = resolverProfessor(td, turma);
        if (!prof) return null;
        const aulasSemana =
          td.carga_horaria_semanal_override ??
          itensMatrizMap.get(`${turma.matriz_curricular_id}-${td.disciplina_id}`)?.carga_horaria_semanal ??
          disc?.carga_semanal ?? 0;
        return { turma: turma.nome, disciplina: disc?.nome ?? `#${td.disciplina_id}`, professorId: prof.id, professorNome: prof.nome, aulasSemana };
      })
      .filter((d) => d !== null)
      .filter((d) => d.aulasSemana > 0);

    const aulasPorDia = horarioSlotsTurno.length > 0 ? Math.max(...horarioSlotsTurno.map((s) => s.numero_aula)) : 6;
    const slotsPorSemana = aulasPorDia * 5;
    const teto = TETO_AULAS_TURNO[TURNO] ?? 24;

    // Demanda total por professor (soma de aulasSemana em todas as turmas)
    const demandaPorProfessor = new Map();
    const detalheDemanda = new Map();
    for (const d of disciplinasTurma) {
      demandaPorProfessor.set(d.professorId, (demandaPorProfessor.get(d.professorId) ?? 0) + d.aulasSemana);
      if (!detalheDemanda.has(d.professorId)) detalheDemanda.set(d.professorId, []);
      detalheDemanda.get(d.professorId).push(`${d.turma}/${d.disciplina}=${d.aulasSemana}`);
    }

    // Bloqueios por professor (slots distintos indisponiveis nesse turno)
    const professorIdsUsados = new Set(demandaPorProfessor.keys());
    const bloqueiosPorProfessor = new Map();
    for (const d of disponibilidades) {
      if (!professorIdsUsados.has(d.professor_id)) continue;
      if (d.disponivel) continue;
      if (!(d.turno === TURNO || d.turno == null)) continue;
      const chave = `${d.dia_semana}-${d.horario_slot}`;
      if (!bloqueiosPorProfessor.has(d.professor_id)) bloqueiosPorProfessor.set(d.professor_id, new Set());
      bloqueiosPorProfessor.get(d.professor_id).add(chave);
    }

    log(`Turno: ${TURNO} | aulasPorDia: ${aulasPorDia} | slots/semana: ${slotsPorSemana} | teto SEED-PR: ${teto}\n`);

    const violacoesTeto = [];
    const violacoesDisponibilidade = [];
    const apertados = [];

    for (const [profId, demanda] of demandaPorProfessor.entries()) {
      const prof = professorMap.get(profId);
      const bloqueadosSet = bloqueiosPorProfessor.get(profId) ?? new Set();
      const disponivel = slotsPorSemana - bloqueadosSet.size;

      if (demanda > teto) {
        violacoesTeto.push({ nome: prof?.nome ?? `#${profId}`, demanda, teto });
      }
      if (demanda > disponivel) {
        violacoesDisponibilidade.push({ nome: prof?.nome ?? `#${profId}`, demanda, disponivel, bloqueados: bloqueadosSet.size });
      }
      const folga = disponivel - demanda;
      if (folga <= 3 && demanda <= teto && demanda <= disponivel) {
        apertados.push({ nome: prof?.nome ?? `#${profId}`, demanda, disponivel, folga });
      }
    }

    log(`=== A. Professores ACIMA do teto SEED-PR (${teto} aulas/semana no ${TURNO}) -- IMPOSSIVEL de resolver, nao so dificil ===`);
    log(`Total: ${violacoesTeto.length}`);
    for (const v of violacoesTeto.sort((a, b) => b.demanda - a.demanda)) {
      log(`  ${v.nome}: precisa dar ${v.demanda} aulas/semana, teto é ${v.teto} (excesso de ${v.demanda - v.teto})`);
    }

    log(`\n=== B. Professores com demanda MAIOR que os slots disponíveis (descontando bloqueios de disponibilidade) -- IMPOSSIVEL ===`);
    log(`Total: ${violacoesDisponibilidade.length}`);
    for (const v of violacoesDisponibilidade.sort((a, b) => (b.demanda - b.disponivel) - (a.demanda - a.disponivel))) {
      log(`  ${v.nome}: precisa de ${v.demanda} aulas, só tem ${v.disponivel} slots livres (${v.bloqueados} bloqueados de ${slotsPorSemana}) -- déficit de ${v.demanda - v.disponivel}`);
    }

    log(`\n=== C. Professores "apertados" (folga <= 3 slots, tecnicamente possível mas deixa o solver mais lento) ===`);
    log(`Total: ${apertados.length}`);
    for (const a of apertados.sort((x, y) => x.folga - y.folga)) {
      log(`  ${a.nome}: precisa de ${a.demanda}, tem ${a.disponivel} livres (folga de só ${a.folga})`);
    }

    log(`\n=== RESUMO ===`);
    log(`Professores usados neste turno: ${demandaPorProfessor.size}`);
    log(`Violações de teto: ${violacoesTeto.length}`);
    log(`Violações de disponibilidade: ${violacoesDisponibilidade.length}`);
    log(`Apertados (folga <= 3): ${apertados.length}`);
    if (violacoesTeto.length > 0 || violacoesDisponibilidade.length > 0) {
      log(`\n[CONCLUSÃO] Existe pelo menos um professor cuja carga é matematicamente impossível de encaixar. O solver NUNCA vai achar uma solução enquanto isso não for corrigido, não importa quanto tempo ou CPU se dê a ele -- é uma prova de INFEASIBLE que ele ainda não terminou de fazer, não falta de recurso.`);
    } else {
      log(`\n[CONCLUSÃO] Nenhuma violação matemática dura encontrada. O problema é resolvível em teoria -- a dificuldade em achar a solução dentro do tempo é sobre densidade de restrições, não sobre impossibilidade.`);
    }

  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, `diagnostico-sobrecarga-${Date.now()}.txt`), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
