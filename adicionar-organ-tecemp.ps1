# Adiciona as duas ultimas siglas do Matutino confirmadas por Simone:
# ORGAN. = "Lid Org e Ges de Pessoas" (SAE 5034)
# TECEMP = "In Tec e Empreendedorismo" (SAE 5999)
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\adicionar-organ-tecemp.ps1

$caminho = "scripts\sincronizar-grade.ts"

if (-not (Test-Path $caminho)) {
    Write-Error "Arquivo nao encontrado: $caminho"
    exit 1
}

$conteudo = Get-Content -Path $caminho -Raw -Encoding UTF8

function Substituir($original, $busca, $novo, $descricao) {
    if (-not $original.Contains($busca)) {
        Write-Error "Nao encontrei o trecho esperado para: $descricao. Nada foi alterado."
        exit 1
    }
    return $original.Replace($busca, $novo)
}

$busca = @'
  "INFAPL": "informatica aplicada",
'@
$novo = @'
  "INFAPL": "informatica aplicada",
  "ORGAN.": "lid org e ges de pessoas",
  "TECEMP": "in tec e empreendedorismo",
'@
$conteudo = Substituir $conteudo $busca $novo "adicao de ORGAN. e TECEMP"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! ORGAN. e TECEMP adicionados ao dicionario." -ForegroundColor Green
