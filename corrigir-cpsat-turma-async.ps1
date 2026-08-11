# [FIX-ASYNC-TURMA] Fecha a ultima lacuna de resiliencia: a geracao
# CP-SAT de turma unica ("Turma (Beta)") ainda usava a rota sincrona
# antiga (/gerar-cpsat), sem nenhuma das protecoes ja aplicadas ao
# turno inteiro (polling resiliente a falha de rede, persistencia +
# retomada automatica em sessionStorage). Como o backend ja aceita
# turmaId na rota assincrona (/gerar-cpsat-async), a migracao e so no
# frontend: troca a chamada sincrona pelo mesmo padrao de job+polling,
# reaproveitando pollarStatusCpsat ja criado pro turno inteiro.
#
# Pre-requisitos: corrigir-polling-cpsat-rede.ps1 e
# corrigir-polling-cpsat-persistencia.ps1 ja devem ter sido aplicados
# (este script depende de pollarStatusCpsat e CPSAT_JOB_PENDENTE_KEY
# ja existirem no arquivo).
#
# Uso:
#   cd C:\Projetos\nexgrade-app
#   .\corrigir-cpsat-turma-async.ps1

$ErrorActionPreference = "Stop"

$arquivo = "artifacts\horario-escolar\src\pages\horario\index.tsx"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo. Rode este script na raiz do repo (C:\Projetos\nexgrade-app)." -ForegroundColor Red
    exit 1
}

Write-Host "Lendo $arquivo..." -ForegroundColor Cyan
$conteudoBruto = Get-Content -Path $arquivo -Raw -Encoding UTF8
$usaCRLF = $conteudoBruto -match "`r`n"
# Normaliza pra LF antes de comparar -- evita falso-negativo se o
# arquivo estiver em CRLF (ver licao aprendida no patch anterior).
$conteudo = $conteudoBruto -replace "`r`n", "`n"

if ($conteudo -notmatch [regex]::Escape("async function pollarStatusCpsat")) {
    Write-Host "ERRO: nao encontrei 'pollarStatusCpsat' no arquivo -- aplique corrigir-polling-cpsat-rede.ps1 e corrigir-polling-cpsat-persistencia.ps1 primeiro." -ForegroundColor Red
    exit 1
}

if ($conteudo -match [regex]::Escape("CPSAT_TURMA_JOB_PENDENTE_KEY")) {
    Write-Host "AVISO: 'CPSAT_TURMA_JOB_PENDENTE_KEY' ja existe no arquivo -- parece que este patch ja foi aplicado antes. Abortando sem alterar nada." -ForegroundColor Yellow
    exit 0
}

# ── Parte 1: adiciona a chave de sessionStorage pra turma unica, logo
#    ao lado da chave do turno inteiro ──────────────────────────────

$anchorChaveExistente = 'const CPSAT_JOB_PENDENTE_KEY = "nexgrade:cpsat-job-pendente";'

$ocorrenciasAnchorChave = ([regex]::Matches($conteudo, [regex]::Escape($anchorChaveExistente))).Count
if ($ocorrenciasAnchorChave -ne 1) {
    Write-Host "ERRO: esperava 1 ocorrencia da declaracao de CPSAT_JOB_PENDENTE_KEY, encontrei $ocorrenciasAnchorChave." -ForegroundColor Red
    exit 1
}

$novaChave = @'


// Chave separada pra job pendente de turma unica (Beta), pra nao
// colidir com o job de turno inteiro se os dois ficarem pendentes ao
// mesmo tempo (ex.: usuario troca de aba no meio de cada um).
const CPSAT_TURMA_JOB_PENDENTE_KEY = "nexgrade:cpsat-turma-job-pendente";
'@

$conteudo = $conteudo.Replace($anchorChaveExistente, ($anchorChaveExistente + $novaChave))

# ── Parte 2: substitui handleGerarCpsatTurma sincrono por versao
#    assincrona com finalizarJobCpsatTurma + useEffect de retomada ──

$originalHandler = @'
  const handleGerarCpsatTurma = async () => {
    if (!cpsatTurmaForm.turmaId) { toast({ title: "Selecione uma turma", variant: "destructive" }); return; }
    if (!cpsatTurmaForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsatTurma(true);
    try {
      // [FIX] fetch() sem token Bearer -- "Turma (Beta)" voltava 401
      // desde que foi criada hoje. customFetch já anexa o token.
      const result = await customFetch<{
        totalSlots: number;
        status: string;
        tempoResolucaoS: number;
      }>("/api/horarios/gerar-cpsat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turmaId: Number(cpsatTurmaForm.turmaId),
          nomeExperimental: cpsatTurmaForm.nomeExperimental,
        }),
        responseType: "json",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${result.totalSlots} aulas criadas.`,
        description: result.status === "OPTIMAL"
          ? `Solucao otima em ${result.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${result.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsatTurma(false);
      setNomeExpandido(cpsatTurmaForm.nomeExperimental);
      setTurmaExpandidaId(Number(cpsatTurmaForm.turmaId));
    } catch (err) {
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoCpsatTurma(false);
    }
  };
'@

$novoHandler = @'
  // Mesma logica de finalizarJobCpsat (turno inteiro), mas pro fluxo
  // de turma unica -- reaproveita pollarStatusCpsat integralmente, so
  // muda o que acontece com o resultado (estado/toast especificos de
  // turma unica).
  const finalizarJobCpsatTurma = async (jobId: string, nomeExperimental: string, turmaId: number) => {
    try {
      const statusResult = await pollarStatusCpsat(jobId);
      if (statusResult.jobStatus === "error") {
        throw new Error(statusResult.mensagem || statusResult.detalhe || statusResult.error || "Erro ao gerar a grade com o motor CP-SAT.");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${statusResult.totalSlots} aulas criadas.`,
        description: statusResult.status === "OPTIMAL"
          ? `Solucao otima em ${statusResult.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${statusResult.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsatTurma(false);
      setNomeExpandido(nomeExperimental);
      setTurmaExpandidaId(turmaId);
    } catch (err) {
      const mensagemErro = err instanceof Error ? err.message : String(err);
      // JOB_NAO_ENCONTRADO so acontece na retomada automatica (job
      // expirou ou pertence a outra escola) -- encerra em silencio.
      if (mensagemErro !== "JOB_NAO_ENCONTRADO") {
        toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    } finally {
      setGerandoCpsatTurma(false);
      try {
        sessionStorage.removeItem(CPSAT_TURMA_JOB_PENDENTE_KEY);
      } catch {
        // sessionStorage indisponivel -- nao ha o que fazer.
      }
    }
  };

  const handleGerarCpsatTurma = async () => {
    if (!cpsatTurmaForm.turmaId) { toast({ title: "Selecione uma turma", variant: "destructive" }); return; }
    if (!cpsatTurmaForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsatTurma(true);
    try {
      // [FIX-ASYNC-TURMA] Migrado pra rota assincrona
      // (/gerar-cpsat-async, que ja aceita turmaId), mesmo padrao do
      // turno inteiro -- evita o timeout de ~300s do proxy do Render
      // numa turma pesada e ganha de graca a resiliencia de rede e a
      // retomada automatica (useEffect abaixo) se a aba pausar no
      // meio do processo. customFetch ja anexa o token.
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turmaId: Number(cpsatTurmaForm.turmaId),
          nomeExperimental: cpsatTurmaForm.nomeExperimental,
        }),
        responseType: "json",
      });
      try {
        sessionStorage.setItem(
          CPSAT_TURMA_JOB_PENDENTE_KEY,
          JSON.stringify({
            jobId: inicio.jobId,
            nomeExperimental: cpsatTurmaForm.nomeExperimental,
            turmaId: Number(cpsatTurmaForm.turmaId),
          }),
        );
      } catch {
        // sessionStorage indisponivel -- segue sem persistencia.
      }
      await finalizarJobCpsatTurma(inicio.jobId, cpsatTurmaForm.nomeExperimental, Number(cpsatTurmaForm.turmaId));
    } catch (err) {
      // So cai aqui se o POST inicial falhar (antes de existir um
      // jobId) -- finalizarJobCpsatTurma cuida do resto.
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setGerandoCpsatTurma(false);
    }
  };

  // [FIX-PERSISTENCIA] Retomada automatica do job CP-SAT de turma
  // unica pendente -- mesma ideia do turno inteiro, chave separada.
  useEffect(() => {
    let pendente: { jobId: string; nomeExperimental: string; turmaId: number } | null = null;
    try {
      const raw = sessionStorage.getItem(CPSAT_TURMA_JOB_PENDENTE_KEY);
      if (raw) pendente = JSON.parse(raw);
    } catch {
      pendente = null;
    }
    if (!pendente?.jobId) return;
    setGerandoCpsatTurma(true);
    setOpenGerarCpsatTurma(true);
    setCpsatTurmaForm((f) => ({
      ...f,
      nomeExperimental: pendente!.nomeExperimental || f.nomeExperimental,
      turmaId: String(pendente!.turmaId),
    }));
    toast({
      title: "Retomando geracao com CP-SAT...",
      description: "A pagina foi recarregada antes do resultado chegar -- continuando de onde parou.",
    });
    void finalizarJobCpsatTurma(pendente.jobId, pendente.nomeExperimental, pendente.turmaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
'@

$ocorrenciasHandler = ([regex]::Matches($conteudo, [regex]::Escape($originalHandler))).Count
if ($ocorrenciasHandler -ne 1) {
    Write-Host "ERRO: esperava exatamente 1 ocorrencia do handleGerarCpsatTurma esperado, encontrei $ocorrenciasHandler." -ForegroundColor Red
    exit 1
}

$conteudo = $conteudo.Replace($originalHandler, $novoHandler)

if ($usaCRLF) {
    $conteudo = $conteudo -replace "`n", "`r`n"
}

Set-Content -Path $arquivo -Value $conteudo -Encoding UTF8 -NoNewline

Write-Host "Pronto! Geracao de turma unica agora usa o mesmo padrao assincrono resiliente do turno inteiro." -ForegroundColor Green
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. npx tsc --noEmit   (conferir que compila sem erros)"
Write-Host "  2. git diff $arquivo  (revisar a mudanca)"
Write-Host "  3. git add -A; git commit -m 'fix: migra geracao CP-SAT de turma unica pro fluxo assincrono resiliente'"
Write-Host "  4. git push"
