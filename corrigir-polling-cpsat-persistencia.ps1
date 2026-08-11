# [FIX-PERSISTENCIA] O polling do CP-SAT depende da aba do navegador
# continuar executando JS o tempo todo (ate 300s+). Se o navegador
# pausar ou descartar a aba em segundo plano (comum com bloqueio de
# tela, troca de janela, ou politicas de MDM em maquinas gerenciadas),
# o React remonta do zero ao voltar -- perdendo todo o estado (modal,
# jobId, progresso) SEM nenhum erro, porque nao houve excecao alguma:
# o codigo simplesmente parou de rodar e nasceu de novo.
#
# Este patch guarda o jobId pendente no sessionStorage assim que o job
# e criado, e adiciona um useEffect que roda ao carregar a pagina: se
# encontrar um job pendente, retoma o polling sozinho, sem o usuario
# precisar clicar em nada de novo.
#
# Pre-requisito: corrigir-polling-cpsat-rede.ps1 ja deve ter sido
# aplicado (este script depende do bloco [FIX-REDE] ja estar no lugar).
#
# Uso:
#   cd C:\Projetos\nexgrade-app
#   .\corrigir-polling-cpsat-persistencia.ps1

$ErrorActionPreference = "Stop"

$arquivo = "artifacts\horario-escolar\src\pages\horario\index.tsx"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo. Rode este script na raiz do repo (C:\Projetos\nexgrade-app)." -ForegroundColor Red
    exit 1
}

Write-Host "Lendo $arquivo..." -ForegroundColor Cyan
$conteudo = Get-Content -Path $arquivo -Raw -Encoding UTF8

# ── Parte 1: insere a funcao de polling reutilizavel + tipo, no nivel
#    do modulo, logo antes da declaracao do componente ──────────────

$anchorComponente = @'
export default function HorarioHubPage() {
'@

$ocorrenciasAnchor = ([regex]::Matches($conteudo, [regex]::Escape($anchorComponente))).Count
if ($ocorrenciasAnchor -ne 1) {
    Write-Host "ERRO: esperava 1 ocorrencia de 'export default function HorarioHubPage() {', encontrei $ocorrenciasAnchor." -ForegroundColor Red
    exit 1
}

$blocoModulo = @'
type StatusCpsatResult = {
  jobStatus: "running" | "done" | "error";
  httpStatusOriginal?: number;
  totalTurmas?: number;
  totalSlots?: number;
  status?: string;
  tempoResolucaoS?: number;
  error?: string;
  mensagem?: string;
  detalhe?: string;
};

// Chave no sessionStorage para o job CP-SAT pendente (turno inteiro).
// [FIX-PERSISTENCIA] Ver comentario no topo deste arquivo/patch.
const CPSAT_JOB_PENDENTE_KEY = "nexgrade:cpsat-job-pendente";

// Faz o polling resiliente de /gerar-cpsat-status/:jobId ate o job
// sair do estado "running". Extraida como funcao de modulo (nao
// depende de estado do componente) para poder ser chamada tanto pelo
// fluxo normal (handleGerarCpsat) quanto pela retomada automatica no
// useEffect de montagem.
async function pollarStatusCpsat(jobId: string): Promise<StatusCpsatResult> {
  const INTERVALO_POLLING_MS = 4000;
  // [FIX-REDE] Tolera falhas de rede transitorias (fetch failed)
  // durante o polling -- comum em redes de escola com quedas
  // intermitentes de conexao. So desiste de verdade apos varias
  // falhas consecutivas; uma unica queda de ~4s nao aborta mais a
  // geracao inteira. Um 404 "job nao encontrado" (job expirado ou de
  // outra escola) e tratado a parte, sem esperar as tentativas todas.
  const MAX_FALHAS_POLLING_CONSECUTIVAS = 5;
  let falhasPollingConsecutivas = 0;
  let statusResult: StatusCpsatResult;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_POLLING_MS));
    try {
      statusResult = await customFetch<StatusCpsatResult>(`/api/horarios/gerar-cpsat-status/${jobId}`, {
        method: "GET",
        responseType: "json",
      });
      falhasPollingConsecutivas = 0;
    } catch (pollErr) {
      const mensagemPollErr = pollErr instanceof Error ? pollErr.message : String(pollErr);
      if (mensagemPollErr.includes("encontrado")) {
        // Job expirou (>1h) ou pertence a outra escola -- nao adianta
        // insistir, e um erro terminal e nao transitorio.
        throw new Error("JOB_NAO_ENCONTRADO");
      }
      falhasPollingConsecutivas += 1;
      if (falhasPollingConsecutivas >= MAX_FALHAS_POLLING_CONSECUTIVAS) {
        throw new Error(
          `Conexao instavel: nao foi possivel consultar o progresso apos ${MAX_FALHAS_POLLING_CONSECUTIVAS} tentativas (${mensagemPollErr}). A geracao pode ainda estar rodando em segundo plano -- tente novamente em alguns instantes.`,
        );
      }
      continue;
    }
    if (statusResult.jobStatus !== "running") break;
  }
  return statusResult;
}

'@

if ($conteudo -match [regex]::Escape("async function pollarStatusCpsat")) {
    Write-Host "AVISO: 'pollarStatusCpsat' ja existe no arquivo -- parece que este patch ja foi aplicado antes. Abortando sem alterar nada." -ForegroundColor Yellow
    exit 0
}

$conteudo = $conteudo.Replace($anchorComponente, ($blocoModulo + $anchorComponente))

# ── Parte 2: substitui o handleGerarCpsat atual (com o fix de rede)
#    por uma versao que usa pollarStatusCpsat + grava/limpa o
#    sessionStorage, e adiciona o useEffect de retomada ────────────

$originalHandler = @'
  const handleGerarCpsat = async () => {
    if (!cpsatForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsat(true);
    try {
      // [NOVO] Rota assincrona: devolve um jobId na hora (202) em vez
      // de esperar o solver terminar -- evita o timeout de ~300s do
      // proxy do Render em turnos grandes (ex.: matutino do Mario
      // Braga, 24 turmas, pode levar varios minutos). O progresso e
      // consultado via polling em /gerar-cpsat-status/:jobId ate o
      // job sair do estado "running".
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turno: cpsatForm.turno,
          nomeExperimental: cpsatForm.nomeExperimental,
          tempoLimiteS: cpsatForm.tempoLimiteS,
        }),
        responseType: "json",
      });

      const INTERVALO_POLLING_MS = 4000;
      let statusResult: {
        jobStatus: "running" | "done" | "error";
        httpStatusOriginal?: number;
        totalTurmas?: number;
        totalSlots?: number;
        status?: string;
        tempoResolucaoS?: number;
        error?: string;
        mensagem?: string;
        detalhe?: string;
      };
      // [FIX-REDE] Tolera falhas de rede transitorias (fetch failed)
      // durante o polling -- comum em redes de escola com quedas
      // intermitentes de conexao. So desiste de verdade
      // apos varias falhas consecutivas; uma unica queda de ~4s nao
      // aborta mais a geracao inteira.
      const MAX_FALHAS_POLLING_CONSECUTIVAS = 5;
      let falhasPollingConsecutivas = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, INTERVALO_POLLING_MS));
        try {
          statusResult = await customFetch<typeof statusResult>(`/api/horarios/gerar-cpsat-status/${inicio.jobId}`, {
            method: "GET",
            responseType: "json",
          });
          falhasPollingConsecutivas = 0;
        } catch (pollErr) {
          falhasPollingConsecutivas += 1;
          if (falhasPollingConsecutivas >= MAX_FALHAS_POLLING_CONSECUTIVAS) {
            throw new Error(
              pollErr instanceof Error
                ? `Conexao instavel: nao foi possivel consultar o progresso apos ${MAX_FALHAS_POLLING_CONSECUTIVAS} tentativas (${pollErr.message}). A geracao pode ainda estar rodando em segundo plano -- tente novamente em alguns instantes.`
                : "Conexao instavel: nao foi possivel consultar o progresso apos varias tentativas.",
            );
          }
          continue;
        }
        if (statusResult.jobStatus !== "running") break;
      }

      if (statusResult.jobStatus === "error") {
        throw new Error(statusResult.mensagem || statusResult.detalhe || statusResult.error || "Erro ao gerar a grade com o motor CP-SAT.");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${statusResult.totalTurmas} turma(s), ${statusResult.totalSlots} aulas criadas.`,
        description: statusResult.status === "OPTIMAL"
          ? `Solucao otima em ${statusResult.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${statusResult.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsat(false);
      setNomeExpandido(cpsatForm.nomeExperimental);
      setTurmaExpandidaId(null);
    } catch (err) {
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoCpsat(false);
    }
  };
'@

$novoHandler = @'
  // Espera o resultado de um job CP-SAT ja em andamento (via
  // pollarStatusCpsat) e aplica o efeito colateral de sucesso/erro na
  // UI. Reaproveitada tanto pelo fluxo normal (handleGerarCpsat)
  // quanto pela retomada automatica no useEffect abaixo, para que os
  // dois caminhos tenham exatamente o mesmo comportamento final.
  const finalizarJobCpsat = async (jobId: string, nomeExperimental: string) => {
    try {
      const statusResult = await pollarStatusCpsat(jobId);
      if (statusResult.jobStatus === "error") {
        throw new Error(statusResult.mensagem || statusResult.detalhe || statusResult.error || "Erro ao gerar a grade com o motor CP-SAT.");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${statusResult.totalTurmas} turma(s), ${statusResult.totalSlots} aulas criadas.`,
        description: statusResult.status === "OPTIMAL"
          ? `Solucao otima em ${statusResult.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${statusResult.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsat(false);
      setNomeExpandido(nomeExperimental);
      setTurmaExpandidaId(null);
    } catch (err) {
      const mensagemErro = err instanceof Error ? err.message : String(err);
      // JOB_NAO_ENCONTRADO so acontece na retomada automatica (job
      // expirou ha mais de 1h ou pertence a outra escola) -- nao vale
      // a pena assustar o usuario com um toast vermelho por isso,
      // simplesmente encerra em silencio.
      if (mensagemErro !== "JOB_NAO_ENCONTRADO") {
        toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    } finally {
      setGerandoCpsat(false);
      try {
        sessionStorage.removeItem(CPSAT_JOB_PENDENTE_KEY);
      } catch {
        // sessionStorage indisponivel (modo privado, politica do
        // navegador etc.) -- nao ha o que fazer, apenas segue.
      }
    }
  };

  const handleGerarCpsat = async () => {
    if (!cpsatForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsat(true);
    try {
      // [NOVO] Rota assincrona: devolve um jobId na hora (202) em vez
      // de esperar o solver terminar -- evita o timeout de ~300s do
      // proxy do Render em turnos grandes (ex.: matutino do Mario
      // Braga, 24 turmas, pode levar varios minutos). O progresso e
      // consultado via polling em /gerar-cpsat-status/:jobId ate o
      // job sair do estado "running".
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turno: cpsatForm.turno,
          nomeExperimental: cpsatForm.nomeExperimental,
          tempoLimiteS: cpsatForm.tempoLimiteS,
        }),
        responseType: "json",
      });
      // [FIX-PERSISTENCIA] Guarda o jobId antes de comecar o polling
      // -- se a aba for pausada/descartada pelo navegador e o React
      // remontar do zero, o useEffect de retomada abaixo encontra
      // esse registro e continua o polling sozinho, sem o usuario
      // precisar clicar em nada de novo.
      try {
        sessionStorage.setItem(
          CPSAT_JOB_PENDENTE_KEY,
          JSON.stringify({ jobId: inicio.jobId, nomeExperimental: cpsatForm.nomeExperimental }),
        );
      } catch {
        // sessionStorage indisponivel -- segue sem persistencia, como
        // era o comportamento antes deste patch.
      }
      await finalizarJobCpsat(inicio.jobId, cpsatForm.nomeExperimental);
    } catch (err) {
      // So cai aqui se a chamada POST inicial falhar (antes de existir
      // um jobId) -- finalizarJobCpsat cuida do proprio try/catch/finally
      // para tudo que acontece depois disso.
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setGerandoCpsat(false);
    }
  };

  // [FIX-PERSISTENCIA] Ao carregar a pagina, verifica se ha um job
  // CP-SAT pendente salvo no sessionStorage (ver handleGerarCpsat
  // acima). Se houver, retoma o polling automaticamente em vez de
  // deixar a geracao "perdida" sem nenhum aviso ao usuario.
  useEffect(() => {
    let pendente: { jobId: string; nomeExperimental: string } | null = null;
    try {
      const raw = sessionStorage.getItem(CPSAT_JOB_PENDENTE_KEY);
      if (raw) pendente = JSON.parse(raw);
    } catch {
      pendente = null;
    }
    if (!pendente?.jobId) return;
    setGerandoCpsat(true);
    setOpenGerarCpsat(true);
    setCpsatForm((f) => ({ ...f, nomeExperimental: pendente!.nomeExperimental || f.nomeExperimental }));
    toast({
      title: "Retomando geracao com CP-SAT...",
      description: "A pagina foi recarregada antes do resultado chegar -- continuando de onde parou.",
    });
    void finalizarJobCpsat(pendente.jobId, pendente.nomeExperimental);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
'@

$ocorrenciasHandler = ([regex]::Matches($conteudo, [regex]::Escape($originalHandler))).Count
if ($ocorrenciasHandler -ne 1) {
    Write-Host "ERRO: esperava exatamente 1 ocorrencia do handleGerarCpsat esperado, encontrei $ocorrenciasHandler." -ForegroundColor Red
    Write-Host "Confirme que corrigir-polling-cpsat-rede.ps1 ja foi aplicado antes deste script." -ForegroundColor Yellow
    exit 1
}

$conteudo = $conteudo.Replace($originalHandler, $novoHandler)

Set-Content -Path $arquivo -Value $conteudo -Encoding UTF8 -NoNewline

Write-Host "Pronto! Job CP-SAT agora persiste no sessionStorage e retoma sozinho se a pagina remontar." -ForegroundColor Green
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. npx tsc --noEmit   (conferir que compila sem erros)"
Write-Host "  2. git diff $arquivo  (revisar a mudanca)"
Write-Host "  3. git add -A; git commit -m 'fix: persiste job CP-SAT pendente e retoma polling automaticamente'"
Write-Host "  4. git push"
