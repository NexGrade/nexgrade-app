/**
 * teste-carga-cpsat-real.cjs
 *
 * Mesma ideia do teste-carga-cpsat.cjs, mas usa o payload REAL do
 * Mario Braga (turno matutino), lido direto do banco (SOMENTE
 * LEITURA -- nenhuma escrita), replicando exatamente a logica de
 * runCpsatGeneration (artifacts/api-server/src/routes/horarios.ts)
 * para o caso "turno inteiro".
 *
 * Isso elimina a incerteza de payloads sinteticos: usamos os mesmos
 * dados que ja se sabe que resolvem em ~101s (medido em sessao
 * anterior).
 *
 * Dispara N requisicoes CONCORRENTES direto em POST /gerar-grade
 * (sem autenticacao) -- nao grava nada, nao passa pelo Node.
 *
 * Uso:
 *   node teste-carga-cpsat-real.cjs
 *   node teste-carga-cpsat-real.cjs --niveis=1,2,3 --tempoLimiteS=150
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID_MARIO_BRAGA = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const TURNO = 'matutino';

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const envPathAlt = path.join('lib', 'db', '.env');
  const p = fs.existsSync(envPath) ? envPath : envPathAlt;
  const conteudo = fs.readFileSync(p, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    niveis: (args.niveis ?? '1,2,3,4').split(',').map(Number),
    tempoLimiteS: Number(args.tempoLimiteS ?? 150),
    pausaEntreNiveisS: Number(args.pausaEntreNiveisS ?? 90),
    url: args.url ?? 'https://nexgrade-cpsat.onrender.com',
  };
}

// Replica EXATAMENTE a logica de runCpsatGeneration (caso "turno
// inteiro") pra montar o mesmo payload que o backend real monta.
async function montarPayloadReal(client) {
  const turmasDoTurno = (await client.query(
    `SELECT id, nome, turno, nivel_ensino, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND turno = $2`,
    [ESCOLA_ID_MARIO_BRAGA, TURNO]
  )).rows;

  if (turmasDoTurno.length === 0) {
    throw new Error(`Nenhuma turma encontrada para escola=${ESCOLA_ID_MARIO_BRAGA} turno=${TURNO}`);
  }

  const turmaIds = turmasDoTurno.map((t) => t.id);
  const matrizIdsAlvo = [...new Set(turmasDoTurno.map((t) => t.matriz_curricular_id).filter((id) => id != null))];

  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos, itensMatrizTodos, configGeminadas] =
    await Promise.all([
      client.query(`SELECT * FROM turma_disciplinas WHERE turma_id = ANY($1)`, [turmaIds]).then((r) => r.rows),
      client.query(`SELECT * FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID_MARIO_BRAGA]).then((r) => r.rows),
      client.query(`SELECT * FROM professores WHERE escola_id = $1`, [ESCOLA_ID_MARIO_BRAGA]).then((r) => r.rows),
      client.query(`SELECT * FROM disponibilidade_professores`).then((r) => r.rows),
      client.query(`SELECT * FROM horario_slots WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID_MARIO_BRAGA, TURNO]).then((r) => r.rows),
      client.query(`SELECT * FROM professor_disciplinas`).then((r) => r.rows),
      matrizIdsAlvo.length > 0
        ? client.query(`SELECT * FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`, [matrizIdsAlvo]).then((r) => r.rows)
        : Promise.resolve([]),
      client.query(
        `SELECT valor FROM configuracoes WHERE escola_id = $1 AND chave = 'seed_pr.max_aulas_geminadas_padrao'`,
        [ESCOLA_ID_MARIO_BRAGA]
      ).then((r) => r.rows[0]?.valor),
    ]);

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
    const porNomeTurma = candidatos.find((p) => p.nome.includes(`(${turma.nome})`));
    return porNomeTurma ?? null;
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

  const semProfessorResolvido = [];
  const disciplinasTurma = turmaDiscsTodos
    .map((td) => {
      const turma = turmaMap.get(td.turma_id);
      const disc = disciplinaMap.get(td.disciplina_id);
      const prof = resolverProfessor(td, turma);
      if (!prof) {
        semProfessorResolvido.push({ turma: turma?.nome, disciplina: disc?.nome ?? `Disciplina #${td.disciplina_id}` });
        return null;
      }
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

  if (disciplinasTurma.length === 0) {
    throw new Error('Nenhuma disciplina com carga horaria > 0 e professor definido para este turno.');
  }

  const professorIdsUsados = new Set(
    disciplinasTurma.map((d) => nomeParaProfessorId.get(d.professor)).filter((id) => id != null)
  );
  const bloqueiosDisponibilidade = disponibilidades
    .filter((d) => professorIdsUsados.has(d.professor_id) && !d.disponivel && (d.turno === TURNO || d.turno == null))
    .map((d) => ({
      professor: professorMap.get(d.professor_id)?.nome ?? `Professor #${d.professor_id}`,
      dia: d.dia_semana,
      aula: d.horario_slot,
    }));

  // Turno inteiro: turmaIds ja cobre todas as turmas do turno, entao
  // "outras turmas" fica vazio -- sem bloqueio adicional aqui.
  const bloqueiosProfessor = bloqueiosDisponibilidade;

  const aulasPorDia = horarioSlotsTurno.length > 0
    ? Math.max(...horarioSlotsTurno.map((s) => s.numero_aula))
    : 6;

  console.log(`  -> ${turmasDoTurno.length} turmas, ${disciplinasTurma.length} linhas turma-disciplina, ${professorIdsUsados.size} professores usados, ${bloqueiosProfessor.length} bloqueios de disponibilidade.`);
  if (semProfessorResolvido.length > 0) {
    console.log(`  -> [AVISO] ${semProfessorResolvido.length} disciplina(s) sem professor resolvido (ignoradas, igual ao backend real).`);
  }

  return {
    turno: TURNO,
    aulasPorDia,
    turmas: turmasDoTurno.map((t) => ({ nome: t.nome, turno: t.turno })),
    disciplinasTurma,
    bloqueiosProfessor,
  };
}

async function dispararUmaRequisicao(url, payloadBase, tempoLimiteS, indice) {
  const payload = { ...payloadBase, tempoLimiteS };
  const inicio = Date.now();
  try {
    const resp = await fetch(`${url}/gerar-grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const duracaoTotalS = (Date.now() - inicio) / 1000;
    let corpo = null;
    try { corpo = await resp.json(); } catch { /* corpo nao-JSON */ }
    return {
      indice,
      httpStatus: resp.status,
      ok: resp.ok,
      duracaoTotalS: Number(duracaoTotalS.toFixed(2)),
      statusSolver: corpo?.status ?? null,
      tempoResolucaoS: corpo?.tempoResolucaoS ?? null,
      totalAulas: corpo?.aulas?.length ?? null,
      erro: !resp.ok ? (corpo?.detail ?? `HTTP ${resp.status}`) : null,
    };
  } catch (err) {
    const duracaoTotalS = (Date.now() - inicio) / 1000;
    return {
      indice, httpStatus: null, ok: false,
      duracaoTotalS: Number(duracaoTotalS.toFixed(2)),
      statusSolver: null, tempoResolucaoS: null, totalAulas: null,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checarSaude(url) {
  try {
    const resp = await fetch(`${url}/`, { method: 'GET' });
    return resp.ok;
  } catch {
    return false;
  }
}

async function esperarSaude(url, timeoutS = 90) {
  const inicio = Date.now();
  while ((Date.now() - inicio) / 1000 < timeoutS) {
    if (await checarSaude(url)) return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function main() {
  const cfg = parseArgs();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  log(`Teste de carga (payload REAL) -- nexgrade-cpsat`);
  log(`Escola: Mario Braga | Turno: ${TURNO}`);
  log(`URL: ${cfg.url}`);
  log(`Niveis de concorrencia: ${cfg.niveis.join(', ')}`);
  log(`Tempo limite por requisicao: ${cfg.tempoLimiteS}s`);
  log(`Pausa entre niveis: ${cfg.pausaEntreNiveisS}s\n`);

  log('Conectando ao banco pra montar o payload real...');
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  let payloadBase;
  try {
    payloadBase = await montarPayloadReal(client);
  } finally {
    await client.end();
  }
  log('Payload real montado com sucesso.\n');

  log('Checando se o servico esta acordado...');
  const acordado = await esperarSaude(cfg.url, 90);
  log(acordado ? 'Servico respondendo.\n' : '[AVISO] Servico nao respondeu em 90s -- prosseguindo mesmo assim.\n');

  const resumoGeral = [];

  for (const nivel of cfg.niveis) {
    log(`\n========== NIVEL: ${nivel} requisicao(oes) concorrente(s) ==========`);
    const inicioNivel = Date.now();
    const resultados = await Promise.all(
      Array.from({ length: nivel }, (_, i) => dispararUmaRequisicao(cfg.url, payloadBase, cfg.tempoLimiteS, i + 1))
    );
    const duracaoNivelS = ((Date.now() - inicioNivel) / 1000).toFixed(2);

    let sucessos = 0;
    for (const r of resultados) {
      log(
        `  req#${r.indice}: ${r.ok ? 'OK' : 'FALHOU'} | http=${r.httpStatus ?? '-'} | status_solver=${r.statusSolver ?? '-'} | ` +
        `tempo_resolucao=${r.tempoResolucaoS ?? '-'}s | tempo_total=${r.duracaoTotalS}s | aulas=${r.totalAulas ?? '-'}` +
        (r.erro ? ` | erro="${r.erro}"` : '')
      );
      if (r.ok && (r.statusSolver === 'OPTIMAL' || r.statusSolver === 'FEASIBLE')) sucessos++;
    }
    log(`  Resumo do nivel ${nivel}: ${sucessos}/${nivel} concluiram com sucesso. Duracao total do nivel: ${duracaoNivelS}s.`);
    resumoGeral.push({ nivel, sucessos, total: nivel, duracaoNivelS: Number(duracaoNivelS) });
    if (sucessos < nivel) log(`  [ATENCAO] Falha detectada nesse nivel.`);

    const ultimoNivel = nivel === cfg.niveis[cfg.niveis.length - 1];
    if (!ultimoNivel) {
      log(`  Pausando ${cfg.pausaEntreNiveisS}s antes do proximo nivel...`);
      await new Promise((r) => setTimeout(r, cfg.pausaEntreNiveisS * 1000));
    }
  }

  log(`\n========== RESUMO FINAL ==========`);
  for (const r of resumoGeral) log(`Nivel ${r.nivel}: ${r.sucessos}/${r.total} sucesso(s) | duracao: ${r.duracaoNivelS}s`);
  const primeiraFalha = resumoGeral.find((r) => r.sucessos < r.total);
  if (primeiraFalha) {
    log(`\nPrimeiro nivel com falha: ${primeiraFalha.nivel} requisicoes concorrentes.`);
  } else {
    log(`\nTodos os niveis testados tiveram 100% de sucesso.`);
  }

  const relatorioPath = path.join(__dirname, `teste-carga-cpsat-real-relatorio-${Date.now()}.txt`);
  fs.writeFileSync(relatorioPath, linhasSaida.join('\n'), { encoding: 'utf8' });
  log(`\nRelatorio salvo em: ${relatorioPath}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exitCode = 1;
});
