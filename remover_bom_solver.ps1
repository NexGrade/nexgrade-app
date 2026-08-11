# Remove o BOM (Byte Order Mark) UTF-8 que o Set-Content -Encoding
# UTF8 do Windows PowerShell 5.1 adiciona por padrao -- o arquivo
# original nao tinha BOM, e isso e so ruido no diff, sem necessidade.
#
# Uso:
#   cd C:\Projetos\nexgrade-app
#   .\remover_bom_solver.ps1

$ErrorActionPreference = "Stop"
$arquivo = "cpsat-service\app\solver.py"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo." -ForegroundColor Red
    exit 1
}

$bytes = [System.IO.File]::ReadAllBytes($arquivo)
$bom = [byte[]](0xEF, 0xBB, 0xBF)

if ($bytes.Length -ge 3 -and $bytes[0] -eq $bom[0] -and $bytes[1] -eq $bom[1] -and $bytes[2] -eq $bom[2]) {
    $semBom = $bytes[3..($bytes.Length - 1)]
    [System.IO.File]::WriteAllBytes($arquivo, $semBom)
    Write-Host "BOM removido de $arquivo." -ForegroundColor Green
    Write-Host "Proximos passos:" -ForegroundColor Cyan
    Write-Host "  1. git diff $arquivo"
    Write-Host "  2. git add -A; git commit -m 'chore: remove BOM introduzido acidentalmente no solver.py'"
    Write-Host "  3. git push"
} else {
    Write-Host "Nenhum BOM encontrado no inicio do arquivo -- nada a fazer." -ForegroundColor Yellow
}
