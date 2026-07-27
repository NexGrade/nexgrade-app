$caminho = "scripts\sincronizar-grade.ts"
$conteudo = Get-Content -Path $caminho -Raw -Encoding UTF8

$busca = @"
    let disc: typeof disciplinas[number] | undefined;
    if (CANDIDATOS_AMBIGUOS[item.disciplinaAbrev]) {
"@
$novo = @"
    let disc: typeof disciplinas[number] | undefined;
    if (item.disciplinaAbrev === "E.MARK" && normalizar(item.turmaCodigo) === normalizar("2MA ADM")) {
      disc = disciplinaPorNomeNorm.get(normalizar("Estratégia de Marketing"));
    } else if (CANDIDATOS_AMBIGUOS[item.disciplinaAbrev]) {
"@
if (-not $conteudo.Contains($busca)) {
    Write-Error "Trecho nao encontrado -- nada alterado."
    exit 1
}
$conteudo.Replace($busca, $novo) | Set-Content -Path $caminho -Encoding UTF8 -NoNewline
Write-Host "Pronto! E.MARK corrigido." -ForegroundColor Green
