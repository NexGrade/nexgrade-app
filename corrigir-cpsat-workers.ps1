# Reduz num_search_workers de 8 para 1 no solver CP-SAT.
#
# Motivo: o cpsat-service roda no free tier do Render com 0.1 CPU
# (uma fracao de um nucleo real). Com 8 workers de busca paralela
# competindo por esse recurso escasso, o solver so gasta tempo em
# troca de contexto entre threads em vez de resolver mais rapido --
# nao ha paralelismo real possivel com menos de 1 nucleo inteiro
# disponivel. Reduzir para 1 worker elimina essa competicao inutil e
# deve tornar o tempo de resolucao mais previsivel.
#
# Uso:
#   cd C:\Projetos\nexgrade-app
#   .\corrigir-cpsat-workers.ps1

$ErrorActionPreference = "Stop"

$arquivo = "cpsat-service\app\solver.py"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo. Rode este script na raiz do repo (C:\Projetos\nexgrade-app)." -ForegroundColor Red
    exit 1
}

Write-Host "Lendo $arquivo..." -ForegroundColor Cyan
$conteudoBruto = Get-Content -Path $arquivo -Raw -Encoding UTF8
$usaCRLF = $conteudoBruto -match "`r`n"
$conteudo = $conteudoBruto -replace "`r`n", "`n"

$original = "solver.parameters.num_search_workers = 8"
$novo = "solver.parameters.num_search_workers = 1  # [FIX-CPU] Free tier tem so 0.1 CPU -- mais workers so gera troca de contexto, sem paralelismo real."

$ocorrencias = ([regex]::Matches($conteudo, [regex]::Escape($original))).Count
if ($ocorrencias -ne 1) {
    Write-Host "ERRO: esperava exatamente 1 ocorrencia de '$original', encontrei $ocorrencias." -ForegroundColor Red
    Write-Host "Confira manualmente com: Select-String -Path '$arquivo' -Pattern 'num_search_workers'" -ForegroundColor Yellow
    exit 1
}

$conteudo = $conteudo.Replace($original, $novo)

if ($usaCRLF) {
    $conteudo = $conteudo -replace "`n", "`r`n"
}

Set-Content -Path $arquivo -Value $conteudo -Encoding UTF8 -NoNewline

Write-Host "Pronto! num_search_workers reduzido de 8 para 1." -ForegroundColor Green
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. git diff $arquivo  (revisar a mudanca)"
Write-Host "  2. git add -A; git commit -m 'perf: reduz num_search_workers de 8 para 1 (free tier tem so 0.1 CPU)'"
Write-Host "  3. git push"
