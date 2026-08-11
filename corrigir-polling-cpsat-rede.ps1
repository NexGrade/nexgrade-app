# Corrige o polling assincrono do CP-SAT em index.tsx: antes, qualquer
# falha de rede transitoria (fetch failed) durante o polling de status
# abortava a geracao imediatamente. Agora tolera ate 5 falhas
# consecutivas (~20s de instabilidade) antes de desistir de verdade --
# cenario comum em redes de escola com quedas intermitentes de conexao.
#
# Uso:
#   cd C:\Projetos\nexgrade-app
#   .\corrigir-polling-cpsat-rede.ps1

$ErrorActionPreference = "Stop"

$arquivo = "artifacts\horario-escolar\src\pages\horario\index.tsx"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo. Rode este script na raiz do repo (C:\Projetos\nexgrade-app)." -ForegroundColor Red
    exit 1
}

Write-Host "Lendo $arquivo..." -ForegroundColor Cyan
$conteudo = Get-Content -Path $arquivo -Raw -Encoding UTF8

$original = @'
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, INTERVALO_POLLING_MS));
        statusResult = await customFetch<typeof statusResult>(`/api/horarios/gerar-cpsat-status/${inicio.jobId}`, {
          method: "GET",
          responseType: "json",
        });
        if (statusResult.jobStatus !== "running") break;
      }
'@

$novo = @'
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
'@

if ($conteudo -notmatch [regex]::Escape($original)) {
    Write-Host "ERRO: nao encontrei o trecho original esperado em $arquivo." -ForegroundColor Red
    Write-Host "Pode ser que o arquivo ja tenha sido alterado. Confira manualmente antes de prosseguir." -ForegroundColor Yellow
    exit 1
}

$ocorrencias = ([regex]::Matches($conteudo, [regex]::Escape($original))).Count
if ($ocorrencias -ne 1) {
    Write-Host "ERRO: esperava exatamente 1 ocorrencia do trecho original, encontrei $ocorrencias. Abortando por seguranca." -ForegroundColor Red
    exit 1
}

$conteudoNovo = $conteudo.Replace($original, $novo)

Set-Content -Path $arquivo -Value $conteudoNovo -Encoding UTF8 -NoNewline

Write-Host "Pronto! Polling do CP-SAT agora tolera falhas de rede transitorias." -ForegroundColor Green
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. npx tsc --noEmit   (conferir que compila sem erros)"
Write-Host "  2. git diff $arquivo  (revisar a mudanca)"
Write-Host "  3. git add -A; git commit -m 'fix: tolera falhas de rede transitorias no polling do CP-SAT'"
Write-Host "  4. git push"
