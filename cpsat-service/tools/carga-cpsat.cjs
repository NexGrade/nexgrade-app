/**
 * carga-cpsat.cjs -- teste de carga do motor CP-SAT com varias escolas ao mesmo tempo.
 *
 * Gera ESCOLAS FICTICIAS (nenhum dado real) do tamanho de uma escola media e dispara
 * as geracoes de grade ao mesmo tempo contra o motor (POST /gerar-grade), medindo tempo
 * e resultado de cada uma. O motor nao guarda nada entre pedidos, entao isto mede
 * capacidade (CPU, fila, limite de tempo), nao isolamento de dados.
 *
 * Seguro: por padrao so mostra o PLANO (nao envia nada). Para enviar: --executar.
 * Nao grava em banco nenhum. O token (CPSAT_TOKEN) so e lido do ambiente e nunca e impresso.
 *
 * Uso (PowerShell):
 *   $env:CPSAT_SERVICE_URL = "https://SEU-SERVICO.run.app"
 *   $env:CPSAT_TOKEN = "..."            (o mesmo token do servico)
 *   node .\\carga-cpsat.cjs --escolas=3                  (plano: nao envia)
 *   node .\\carga-cpsat.cjs --escolas=3 --executar       (envia 3 geracoes ao mesmo tempo)
 *
 * Opcoes: --escolas=N (1)  --turmas=N (15)  --aulas-por-dia=5|6 (6)  --tempo=S (10, limite do solver)
 *         --turmas-por-prof=N (2: quantas turmas cada professor atende na mesma disciplina)
 *         --bloqueios=N (2: maximo de bloqueios por professor)  --compartilhar (professores dividem 2 disciplinas)
 *         --url=...  --semente=N (1)  --executar
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));
const ESCOLAS = Number(args.escolas ?? 1);
const TURMAS = Number(args.turmas ?? 15);
const APD = Number(args["aulas-por-dia"] ?? 6);
const TEMPO = Number(args.tempo ?? 10);
const SEMENTE = Number(args.semente ?? 1);
const TURMAS_POR_PROF = Number(args["turmas-por-prof"] ?? 2);
const MAX_BLOQ = Number(args.bloqueios ?? 2);
const COMPARTILHAR = !!args.compartilhar;
const URL_BASE = String(args.url ?? process.env.CPSAT_SERVICE_URL ?? "").replace(/\/+$/, "");
const TOKEN = (process.env.CPSAT_TOKEN ?? "").trim();
const EXECUTAR = !!args.executar;

if (![5, 6].includes(APD)) { console.error("--aulas-por-dia deve ser 5 ou 6"); process.exit(1); }

// gerador pseudo-aleatorio repetivel
function prng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// cargas semanais por disciplina (somam 5*aulasPorDia: 30 ou 25)
const CARGAS = APD === 6 ? [4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1] : [4, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1];
const NOMES = ["LINGUA PORTUGUESA", "MATEMATICA", "HISTORIA", "GEOGRAFIA", "CIENCIAS", "INGLES", "ARTE", "EDUCACAO FISICA", "FILOSOFIA", "SOCIOLOGIA", "FISICA", "QUIMICA"];

function gerarEscola(idx) {
  const rnd = prng(SEMENTE * 1000 + idx);
  const turmas = Array.from({ length: TURMAS }, (_, k) => ({ nome: `E${idx + 1}-T${String(k + 1).padStart(2, "0")}` }));
  const disciplinasTurma = [];
  const profs = new Set();
  const grupoProf = (d, k) => {
    // cada professor atende TURMAS_POR_PROF turmas na mesma disciplina; com --compartilhar,
    // as disciplinas d e d+6 dividem os mesmos professores (mais disputa de horario)
    const grupo = COMPARTILHAR ? d % 6 : d;
    const tam = Math.max(1, Math.ceil(TURMAS / TURMAS_POR_PROF));
    return `E${idx + 1}-P${grupo}-${Math.floor(k / TURMAS_POR_PROF) % tam}`;
  };
  CARGAS.forEach((carga, d) => {
    turmas.forEach((t, k) => {
      const professor = grupoProf(d, k);
      profs.add(professor);
      disciplinasTurma.push({
        turma: t.nome, codigoSae: String(9001 + d), nome: NOMES[d % NOMES.length], aulasSemana: carga,
        professor, maxAulasDia: carga >= 4 ? 2 : 1,
      });
    });
  });
  const bloqueiosProfessor = [];
  for (const p of profs) {
    const n = Math.floor(rnd() * (MAX_BLOQ + 1));
    for (let i = 0; i < n; i++) bloqueiosProfessor.push({ professor: p, dia: Math.floor(rnd() * 5), aula: 1 + Math.floor(rnd() * APD) });
  }
  return { turno: "matutino", aulasPorDia: APD, tempoLimiteS: TEMPO, turmas, disciplinasTurma, bloqueiosProfessor, recursos: [] };
}

const escolas = Array.from({ length: ESCOLAS }, (_, i) => gerarEscola(i));
console.log(`Plano: ${ESCOLAS} escola(s) ficticia(s), ${TURMAS} turmas, ${APD} aulas/dia, limite do solver ${TEMPO}s, semente ${SEMENTE}`);
escolas.forEach((p, i) => {
  const profs = new Set(p.disciplinasTurma.map((d) => d.professor)).size;
  console.log(`  escola ${i + 1}: ${p.disciplinasTurma.length} linhas turma/disciplina, ${profs} professores, ${p.bloqueiosProfessor.length} bloqueios, ${(JSON.stringify(p).length / 1024).toFixed(0)} KB`);
});
if (!EXECUTAR) {
  console.log("\n[PLANO] Nada foi enviado. Rode com --executar para disparar as geracoes ao mesmo tempo.");
  process.exit(0);
}
if (!URL_BASE) { console.error("\nDefina CPSAT_SERVICE_URL (ou --url=...)."); process.exit(1); }

const headers = { "Content-Type": "application/json", ...(TOKEN ? { "x-nexgrade-token": TOKEN } : {}) };
async function um(i, payload) {
  const ini = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), (TEMPO + 180) * 1000);
  try {
    const r = await fetch(`${URL_BASE}/gerar-grade`, { method: "POST", headers, body: JSON.stringify(payload), signal: ac.signal });
    const texto = await r.text();
    let j = {}; try { j = JSON.parse(texto); } catch { /* corpo nao-JSON */ }
    return { i, http: r.status, status: j.status ?? "-", viavel: j.viavel ?? false, aulas: (j.aulas ?? []).length,
      resolucao: j.tempoResolucaoS ?? null, total: (Date.now() - ini) / 1000, erro: r.ok ? "" : String(j.detail ?? texto).slice(0, 80) };
  } catch (e) {
    // o fetch do Node esconde o motivo real em e.cause (ex.: ECONNRESET, UND_ERR_SOCKET, ETIMEDOUT)
    const causa = e.cause ? ` [${e.cause.code ?? e.cause.name ?? ""} ${String(e.cause.message ?? "").slice(0, 60)}]`.replace(/\s+\]/, "]") : "";
    return { i, http: 0, status: "-", viavel: false, aulas: 0, resolucao: null, total: (Date.now() - ini) / 1000, erro: e.name === "AbortError" ? "tempo esgotado" : e.message + causa };
  } finally { clearTimeout(timer); }
}

(async () => {
  const t0 = Date.now();
  // A maquina do CP-SAT liga sob demanda (funcao "acordar-cpsat", POST com X-Token), como a API faz.
  const DESP_URL = (process.env.CPSAT_DESPERTADOR_URL ?? "").trim();
  const DESP_TOKEN = (process.env.CPSAT_DESPERTADOR_TOKEN ?? "").trim();
  if (DESP_URL && DESP_TOKEN) {
    try {
      const r = await fetch(DESP_URL, { method: "POST", headers: { "X-Token": DESP_TOKEN, "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      console.log(`Despertador: HTTP ${r.status} ${j.status ?? ""} ${j.acao ? "(acao: " + j.acao + ")" : ""}`.trim());
    } catch (e) { console.error("Aviso: falha ao chamar o despertador:", e.message); }
  } else {
    console.log("Despertador nao configurado (CPSAT_DESPERTADOR_URL / CPSAT_DESPERTADOR_TOKEN): se a maquina estiver desligada, o teste falha.");
  }
  // espera o motor responder em "/" (ate 3 min)
  let pronto = false;
  while (Date.now() - t0 < 180_000) {
    try {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 5000);
      const r = await fetch(`${URL_BASE}/`, { signal: ac.signal }); clearTimeout(tm);
      if (r.ok) { pronto = true; break; }
    } catch { /* ainda ligando */ }
    await new Promise((res) => setTimeout(res, 5000));
  }
  if (!pronto) { console.error("O motor nao respondeu em 3 minutos. Teste cancelado (nada foi enviado)."); process.exit(1); }
  console.log(`\nServico respondeu em ${((Date.now() - t0) / 1000).toFixed(1)}s. Disparando ${ESCOLAS} geracao(oes) ao mesmo tempo...`);
  const ini = Date.now();
  const res = await Promise.all(escolas.map((p, i) => um(i, p)));
  const parede = (Date.now() - ini) / 1000;
  console.log("\nescola | HTTP | status      | aulas | solver(s) | total(s) | erro");
  for (const r of res) {
    console.log(`${String(r.i + 1).padStart(6)} | ${String(r.http).padStart(4)} | ${String(r.status).padEnd(11)} | ${String(r.aulas).padStart(5)} | ${String(r.resolucao ?? "-").padStart(9)} | ${r.total.toFixed(1).padStart(8)} | ${r.erro}`);
  }
  const ok = res.filter((r) => r.http === 200 && r.viavel);
  const tot = res.map((r) => r.total);
  console.log(`\nResumo: ${ok.length}/${res.length} com grade viavel | tempo total medio ${(tot.reduce((a, b) => a + b, 0) / tot.length).toFixed(1)}s, maximo ${Math.max(...tot).toFixed(1)}s | parede ${parede.toFixed(1)}s`);
  const lento = res.filter((r) => r.resolucao != null && r.resolucao >= TEMPO * 0.95).length;
  if (lento) console.log(`Atencao: ${lento} geracao(oes) usaram quase todo o limite de ${TEMPO}s do solver (sinal de CPU disputada ou grade dificil).`);
})();
