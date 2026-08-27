/**
 * teste-carga-cpsat.cjs
 *
 * Teste de carga/concorrência do motor nexgrade-cpsat (Python/OR-Tools).
 * Gera um payload SINTETICO (nao usa dados reais nem toca no banco) do
 * mesmo tamanho/complexidade do turno matutino do Mario Braga (24
 * turmas, ~665 aulas/semana, professores compartilhados entre turmas
 * -- o compartilhamento e o que deixa o problema dificil de verdade,
 * por causa da RESTRICAO 3 do solver: professor sem 2 turmas ao mesmo
 * tempo).
 *
 * Dispara N requisicoes CONCORRENTES direto em POST /gerar-grade (sem
 * autenticacao, sem passar pelo Node -- o endpoint aceita dict bruto),
 * pra cada nivel de concorrencia configurado, e mede sucesso/tempo.
 *
 * NAO grava nada no banco -- e' 100% leitura/observacao do lado do
 * solver.
 *
 * ATENCAO: isso gera carga real no servico nexgrade-cpsat. Rode em um
 * horario que voce nao se importe se o servico ficar temporariamente
 * lento ou reiniciar por OOM (isso e exatamente o que estamos medindo).
 *
 * Uso:
 *   node teste-carga-cpsat.cjs
 *   node teste-carga-cpsat.cjs --niveis=1,2,3,4 --tempoLimiteS=60 --turmas=24
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    niveis: (args.niveis ?? '1,2,3,4').split(',').map(Number),
    tempoLimiteS: Number(args.tempoLimiteS ?? 60),
    turmas: Number(args.turmas ?? 24),
    disciplinasPorTurma: Number(args.disciplinasPorTurma ?? 11),
    professores: Number(args.professores ?? 45),
    pausaEntreNiveisS: Number(args.pausaEntreNiveisS ?? 90),
    url: args.url ?? 'https://nexgrade-cpsat.onrender.com',
  };
}

// === Gerador de payload sintetico ===
// Reproduz a mesma "forma" de dados que o backend real monta em
// runCpsatGeneration (horarios.ts) para um turno inteiro do tamanho
// do Mario Braga matutino, sem usar nenhum dado real.
function gerarPayloadSintetico({ numTurmas, disciplinasPorTurma, numProfessores }) {
  const NOMES_DISCIPLINAS = [
    'Matematica', 'Portugues', 'Historia', 'Geografia', 'Ciencias',
    'Ingles', 'Educacao Fisica', 'Arte', 'Filosofia', 'Sociologia',
    'Quimica', 'Fisica', 'Biologia', 'Espanhol', 'Redacao',
  ];

  const turmas = [];
  for (let i = 0; i < numTurmas; i++) {
    // Mistura niveis, igual a realidade (Fundamental 5 aulas/dia,
    // Medio/Tecnico 6 aulas/dia) -- ~30% Fundamental, resto Medio/Tecnico,
    // proporcao aproximada observada no Mario Braga.
    const fundamental = i % 3 === 0;
    turmas.push({
      nome: `Turma-Sintetica-${i + 1}`,
      turno: 'matutino',
      ultimaAulaTurma: fundamental ? 5 : 6,
    });
  }

  // Pool de professores -- cada um da aula em varias turmas (2 a 5),
  // pra reproduzir o compartilhamento real que torna a RESTRICAO 3
  // (professor sem 2 turmas ao mesmo tempo) computacionalmente pesada.
  const professores = Array.from({ length: numProfessores }, (_, i) => `Professor-Sintetico-${i + 1}`);

  const disciplinasTurma = [];
  let profCursor = 0;
  for (const turma of turmas) {
    const aulasPorDiaTurma = turma.ultimaAulaTurma;
    const totalDisciplinas = disciplinasPorTurma;
    // Distribui a carga semanal (aulasPorDiaTurma * 5 dias) entre as
    // disciplinas dessa turma, igual a logica real (soma bate com a
    // capacidade da turma).
    const capacidadeSemana = aulasPorDiaTurma * 5;
    const cargaBase = Math.floor(capacidadeSemana / totalDisciplinas);
    let resto = capacidadeSemana - cargaBase * totalDisciplinas;

    for (let d = 0; d < totalDisciplinas; d++) {
      const nomeDisc = NOMES_DISCIPLINAS[d % NOMES_DISCIPLINAS.length];
      let aulasSemana = cargaBase;
      if (resto > 0) { aulasSemana += 1; resto -= 1; }
      if (aulasSemana <= 0) continue;

      // Cicla pelos professores -- cada professor acaba pego por
      // varias turmas diferentes (compartilhamento realista).
      const professor = professores[profCursor % professores.length];
      profCursor++;

      disciplinasTurma.push({
        turma: turma.nome,
        codigoSae: `SINT-${d}`,
        nome: nomeDisc,
        aulasSemana,
        professor,
        maxAulasDia: 2, // padrao de geminadas
        ultimaAulaTurma: turma.ultimaAulaTurma,
      });
    }
  }

  // Sem bloqueios de disponibilidade no sintetico -- deixa o problema
  // mais "livre" (mais facil), entao o tempo medido aqui e um piso
  // otimista; a realidade com bloqueios reais tende a ser um pouco
  // mais lenta, nao mais rapida.
  const bloqueiosProfessor = [];

  const aulasPorDia = Math.max(...turmas.map((t) => t.ultimaAulaTurma));

  return {
    turno: 'matutino',
    aulasPorDia,
    turmas: turmas.map((t) => ({ nome: t.nome, turno: t.turno })),
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
    const httpStatus = resp.status;
    let corpo = null;
    try { corpo = await resp.json(); } catch { /* corpo nao-JSON */ }
    return {
      indice,
      httpStatus,
      ok: resp.ok,
      duracaoTotalS: Number(duracaoTotalS.toFixed(2)),
      statusSolver: corpo?.status ?? null,
      tempoResolucaoS: corpo?.tempoResolucaoS ?? null,
      totalAulas: corpo?.aulas?.length ?? null,
      erro: !resp.ok ? (corpo?.detail ?? `HTTP ${httpStatus}`) : null,
    };
  } catch (err) {
    const duracaoTotalS = (Date.now() - inicio) / 1000;
    return {
      indice,
      httpStatus: null,
      ok: false,
      duracaoTotalS: Number(duracaoTotalS.toFixed(2)),
      statusSolver: null,
      tempoResolucaoS: null,
      totalAulas: null,
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
  const linhas = [];
  const log = (msg = '') => { linhas.push(String(msg)); console.log(msg); };

  log(`Teste de carga -- nexgrade-cpsat`);
  log(`URL: ${cfg.url}`);
  log(`Config sintetica: ${cfg.turmas} turmas, ~${cfg.disciplinasPorTurma} disciplinas/turma, ${cfg.professores} professores`);
  log(`Niveis de concorrencia a testar: ${cfg.niveis.join(', ')}`);
  log(`Tempo limite por requisicao: ${cfg.tempoLimiteS}s`);
  log(`Pausa entre niveis: ${cfg.pausaEntreNiveisS}s\n`);

  const payloadBase = gerarPayloadSintetico({
    numTurmas: cfg.turmas,
    disciplinasPorTurma: cfg.disciplinasPorTurma,
    numProfessores: cfg.professores,
  });
  log(`Payload sintetico gerado: ${payloadBase.disciplinasTurma.length} linhas turma-disciplina, ${payloadBase.turmas.length} turmas.\n`);

  log('Checando se o servico esta acordado (pode hibernar entre usos no free tier)...');
  const acordado = await esperarSaude(cfg.url, 90);
  if (!acordado) {
    log('[AVISO] Servico nao respondeu em 90s -- prosseguindo mesmo assim, mas o primeiro nivel pode falhar so por causa do cold-start.');
  } else {
    log('Servico respondendo.\n');
  }

  const resumoGeral = [];

  for (const nivel of cfg.niveis) {
    log(`\n========== NIVEL: ${nivel} requisicao(oes) concorrente(s) ==========`);
    const inicioNivel = Date.now();
    const promessas = Array.from({ length: nivel }, (_, i) =>
      dispararUmaRequisicao(cfg.url, payloadBase, cfg.tempoLimiteS, i + 1)
    );
    const resultados = await Promise.all(promessas);
    const duracaoNivelS = ((Date.now() - inicioNivel) / 1000).toFixed(2);

    let sucessos = 0;
    for (const r of resultados) {
      const okStr = r.ok ? 'OK' : 'FALHOU';
      log(
        `  req#${r.indice}: ${okStr} | http=${r.httpStatus ?? '-'} | status_solver=${r.statusSolver ?? '-'} | ` +
        `tempo_resolucao=${r.tempoResolucaoS ?? '-'}s | tempo_total=${r.duracaoTotalS}s | aulas=${r.totalAulas ?? '-'}` +
        (r.erro ? ` | erro="${r.erro}"` : '')
      );
      if (r.ok && (r.statusSolver === 'OPTIMAL' || r.statusSolver === 'FEASIBLE')) sucessos++;
    }

    log(`  Resumo do nivel ${nivel}: ${sucessos}/${nivel} concluiram com sucesso (OPTIMAL/FEASIBLE). Duracao total do nivel: ${duracaoNivelS}s.`);
    resumoGeral.push({ nivel, sucessos, total: nivel, duracaoNivelS: Number(duracaoNivelS) });

    if (sucessos < nivel) {
      log(`  [ATENCAO] Nesse nivel ja houve falha -- provavel indicio de limite de capacidade encontrado.`);
    }

    const ultimoNivel = nivel === cfg.niveis[cfg.niveis.length - 1];
    if (!ultimoNivel) {
      log(`  Pausando ${cfg.pausaEntreNiveisS}s antes do proximo nivel (deixa o servico se recuperar caso tenha reiniciado por OOM)...`);
      await new Promise((r) => setTimeout(r, cfg.pausaEntreNiveisS * 1000));
    }
  }

  log(`\n========== RESUMO FINAL ==========`);
  for (const r of resumoGeral) {
    log(`Nivel ${r.nivel}: ${r.sucessos}/${r.total} sucesso(s) | duracao do nivel: ${r.duracaoNivelS}s`);
  }
  const primeiroNivelComFalha = resumoGeral.find((r) => r.sucessos < r.total);
  if (primeiroNivelComFalha) {
    log(`\nPrimeiro nivel com falha: ${primeiroNivelComFalha.nivel} requisicoes concorrentes.`);
    log(`Isso sugere que, no tier atual, o servico aguenta confortavelmente ate ${primeiroNivelComFalha.nivel - 1} geracao(oes) de turno inteiro (tamanho Mario Braga) ao mesmo tempo.`);
  } else {
    log(`\nTodos os niveis testados (ate ${cfg.niveis[cfg.niveis.length - 1]}) tiveram 100% de sucesso. Pode tentar niveis mais altos (--niveis=...) pra achar o limite real.`);
  }

  const relatorioPath = path.join(__dirname, `teste-carga-cpsat-relatorio-${Date.now()}.txt`);
  fs.writeFileSync(relatorioPath, linhas.join('\n'), { encoding: 'utf8' });
  log(`\nRelatorio completo salvo em: ${relatorioPath}`);
}

main().catch((err) => {
  console.error('Erro fatal no teste de carga:', err);
  process.exitCode = 1;
});
