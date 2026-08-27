# corrigir-seed-preco-mensal.ps1
#
# Corrige scripts/src/seed.ts: a coluna da tabela planos foi renomeada
# de "preco" para "precoMensal" no schema (lib/db/src/schema/escolas.ts),
# mas o seed.ts nao foi atualizado -- causa erro TS2769 no typecheck.
#
# Uso:
#   .\corrigir-seed-preco-mensal.ps1              # dry-run
#   .\corrigir-seed-preco-mensal.ps1 -Aplicar      # aplica de verdade

param([switch]$Aplicar)

$ErrorActionPreference = "Stop"
$caminhoArquivo = "scripts\src\seed.ts"

if (-not (Test-Path $caminhoArquivo)) {
    Write-Error "Nao encontrei $caminhoArquivo -- rode este script a partir da raiz do projeto."
    exit 1
}

$conteudo = [System.IO.File]::ReadAllText((Resolve-Path $caminhoArquivo))

$linhasAlvo = @(
    '{ nome: "Gratuito", preco: 0, maxProfessores: 5, maxTurmas: 3, temIA: true, temExport: false, temImport: false, ativo: true },',
    '{ nome: "Pro", preco: 150, maxProfessores: 30, maxTurmas: 20, temIA: true, temExport: true, temImport: true, ativo: true },',
    '{ nome: "Master", preco: 400, maxProfessores: 9999, maxTurmas: 9999, temIA: true, temExport: true, temImport: true, ativo: true },'
)
$linhasNovas = @(
    '{ nome: "Gratuito", precoMensal: 0, maxProfessores: 5, maxTurmas: 3, temIA: true, temExport: false, temImport: false, ativo: true },',
    '{ nome: "Pro", precoMensal: 150, maxProfessores: 30, maxTurmas: 20, temIA: true, temExport: true, temImport: true, ativo: true },',
    '{ nome: "Master", precoMensal: 400, maxProfessores: 9999, maxTurmas: 9999, temIA: true, temExport: true, temImport: true, ativo: true },'
)

$totalEncontradas = 0
for ($i = 0; $i -lt $linhasAlvo.Length; $i++) {
    $antiga = $linhasAlvo[$i]
    $nova = $linhasNovas[$i]
    if ($conteudo.Contains($antiga)) {
        $conteudo = $conteudo.Replace($antiga, $nova)
        Write-Host "[OK] Linha $($i+1)/3 corrigida (preco -> precoMensal)."
        $totalEncontradas++
    } else {
        Write-Warning "[NAO ENCONTRADO] Linha $($i+1)/3 nao bateu exatamente -- pode ja estar corrigida, ou o texto mudou. Pulando essa, sem abortar as outras."
    }
}

if ($totalEncontradas -eq 0) {
    Write-Error "Nenhuma das 3 linhas foi encontrada. Nada foi alterado. Verifique se o arquivo ja foi corrigido antes."
    exit 1
}

if ($Aplicar) {
    $utf8SemBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $caminhoArquivo), $conteudo, $utf8SemBom)
    Write-Host "`n✅ Arquivo gravado: $caminhoArquivo ($totalEncontradas/3 linhas corrigidas)"
} else {
    Write-Host "`n↩️  DRY-RUN -- nada foi gravado. Rode com -Aplicar para gravar de verdade."
    Write-Host "($totalEncontradas/3 linhas seriam corrigidas)"
}
