const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const ESCOLA_ID = process.argv[2] || 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const TURNO = process.argv[3] || 'matutino';
const TETO_AULAS_TURNO = { noturno: 19, matutino: 24, vespertino: 24 };

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const turmasDoTurno = (await client.query(
      `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND turno = $2`,
      [ESCOLA_ID, TURNO]
    )).rows;
    const turmaIds = turmasDoTurno.map((t) => t.id);

    const turmaDiscsTodos = (await client.query(`SELECT * FROM turma_disciplinas WHERE turma_id = ANY($1)`, [turmaIds])).rows;
    const disciplinas = (await client.query(`SELECT * FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const professoresTodos = (await client.query(`SELECT * FROM professores WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const disponibilidades = (await client.query(`SELECT * FROM disponibilidade_professores`)).rows;
    const horarioSlotsTurno = (await client.query(`SELECT * FROM horario_slots WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID, TURNO])).rows;
    const profDiscsTodos = (await client.query(`SELECT * FROM professor_disciplinas`)).rows;
    const matrizIds = [...new Set(turmasDoTurno.map(t => t.matriz_curricular_id).filter(id => id != null))];
    const itensMatrizTodos = matrizIds.length > 0
      ? (await client.query(`SELECT * FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`, [matrizIds])).rows
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

    const demandaPorProfessor = new Map();
    for (const d of disciplinasTurma) {
      demandaPorProfessor.set(d.professorId, (demandaPorProfessor.get(d.professorId) ?? 0) + d.aulasSemana);
    }

    const professorIdsUsados = new Set(demandaPorProfessor.keys());

    // [ATUALIZADO] Agora conta bloqueio de disponibilidade E HA juntos
    // como "slot consumido" -- antes so contava bloqueio, porque HA
    // nao bloqueava nada de verdade no motor.
    const consumidoPorProfessor = new Map();
    for (const d of disponibilidades) {
      if (!professorIdsUsados.has(d.professor_id)) continue;
      const ehBloqueio = !d.disponivel;
      const ehHA = d.hora_atividade_obrigatoria;
      if (!ehBloqueio && !ehHA) continue;
      if (!(d.turno === TURNO || d.turno == null)) continue;
      const chave = `${d.dia_semana}-${d.horario_slot}`;
      if (!consumidoPorProfessor.has(d.professor_id)) consumidoPorProfessor.set(d.professor_id, new Set());
      consumidoPorProfessor.get(d.professor_id).add(chave);
    }

    console.log(`Turno: ${TURNO} | aulasPorDia: ${aulasPorDia} | slots/semana: ${slotsPorSemana} | teto SEED-PR: ${teto}\n`);

    const violacoes = [];
    const apertados = [];

    for (const [profId, demanda] of demandaPorProfessor.entries()) {
      const prof = professorMap.get(profId);
      const consumidoSet = consumidoPorProfessor.get(profId) ?? new Set();
      const disponivel = slotsPorSemana - consumidoSet.size;

      if (demanda > teto) {
        violacoes.push({ tipo: 'TETO', nome: prof?.nome ?? `#${profId}`, demanda, limite: teto });
      }
      if (demanda > disponivel) {
        violacoes.push({ tipo: 'DISPONIBILIDADE+HA', nome: prof?.nome ?? `#${profId}`, demanda, disponivel, consumido: consumidoSet.size });
      }
      const folga = disponivel - demanda;
      if (folga >= 0 && folga <= 3 && demanda <= teto && demanda <= disponivel) {
        apertados.push({ nome: prof?.nome ?? `#${profId}`, demanda, disponivel, folga });
      }
    }

    console.log(`=== Violações (impossível matematicamente, considerando bloqueio + HA) ===`);
    console.log(`Total: ${violacoes.length}`);
    for (const v of violacoes) {
      if (v.tipo === 'TETO') {
        console.log(`  [TETO] ${v.nome}: precisa de ${v.demanda}, teto é ${v.limite}`);
      } else {
        console.log(`  [DISPONIBILIDADE+HA] ${v.nome}: precisa de ${v.demanda} aulas, só tem ${v.disponivel} slots livres (${v.consumido} consumidos de ${slotsPorSemana} -- bloqueio + HA)`);
      }
    }

    console.log(`\n=== Apertados (folga 0-3, tecnicamente possivel mas dificil) ===`);
    console.log(`Total: ${apertados.length}`);
    for (const a of apertados.sort((x, y) => x.folga - y.folga)) {
      console.log(`  ${a.nome}: precisa de ${a.demanda}, tem ${a.disponivel} livres (folga de ${a.folga})`);
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Professores usados neste turno: ${demandaPorProfessor.size}`);
    console.log(`Violações: ${violacoes.length}`);
    if (violacoes.length > 0) {
      console.log(`\n[CONCLUSAO] Achamos a causa do INVIAVEL -- pelo menos um professor tem mais aulas exigidas do que espaco livre, contando bloqueio de disponibilidade + HA juntos.`);
    } else {
      console.log(`\n[CONCLUSAO] Nenhuma violacao encontrada -- o INVIAVEL pode ser uma combinacao de restricoes entre professores diferentes competindo pelos mesmos horarios, nao um professor sozinho.`);
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
