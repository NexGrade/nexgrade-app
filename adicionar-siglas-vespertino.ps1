# Adiciona as siglas novas encontradas no Vespertino (a maioria sao
# variacoes sem ponto de siglas ja mapeadas -- ex: EDFIS = ED.FIS).
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\adicionar-siglas-vespertino.ps1

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
  "ORGAN.": "lid org e ges de pessoas",
  "TECEMP": "in tec e empreendedorismo",
'@
$novo = @'
  "ORGAN.": "lid org e ges de pessoas",
  "TECEMP": "in tec e empreendedorismo",

  // ── Vespertino (variacoes sem ponto de siglas ja conhecidas + novas) ──
  "EDFIS": "educacao fisica",
  "INGL": "lingua estrangeira moderna - ingles",
  "LPORT": "lingua portuguesa e literatura",
  "ENSREL": "ensino religioso",
  "RED": "redacao e leitura",
'@
$conteudo = Substituir $conteudo $busca $novo "adicao das siglas do Vespertino"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Siglas do Vespertino adicionadas." -ForegroundColor Green
