$caminho = "artifacts\api-server\src\routes\ai.ts"
$conteudo = Get-Content -Path $caminho -Raw -Encoding UTF8

$busca = "const GEMINI_MODEL = `"gemini-2.0-flash`";"
$novo = "const GEMINI_MODEL = `"gemini-3-flash-preview`";"

if (-not $conteudo.Contains($busca)) {
    Write-Error "Trecho nao encontrado -- nada alterado."
    exit 1
}
$conteudo.Replace($busca, $novo) | Set-Content -Path $caminho -Encoding UTF8 -NoNewline
Write-Host "Pronto! Modelo atualizado para gemini-3-flash-preview." -ForegroundColor Green
