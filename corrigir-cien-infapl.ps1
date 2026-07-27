# Corrige um bug: a busca no dicionario ABREV_PARA_NOME nao normalizava
# o valor antes de comparar com o mapa (que ja e normalizado), entao
# nomes com parenteses como "Ciencias (Fundamental)" nunca batiam.
# Tambem adiciona a sigla INFAPL que faltou (Informatica Aplicada).
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\corrigir-cien-infapl.ps1

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

# ── 1. Corrige a busca no dicionario pra normalizar o valor antes de comparar ──
$buscaBug = @'
    } else {
      const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
      disc = nomeBusca ? disciplinaPorNomeNorm.get(nomeBusca) : undefined;
    }
'@
$novoBug = @'
    } else {
      const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
      disc = nomeBusca ? disciplinaPorNomeNorm.get(normalizar(nomeBusca)) : undefined;
    }
'@
$conteudo = Substituir $conteudo $buscaBug $novoBug "bug de normalizacao na busca do dicionario"

# ── 2. Adiciona INFAPL ──
$buscaInfapl = @'
  "ING1": "lingua inglesa 1",
'@
$novoInfapl = @'
  "ING1": "lingua inglesa 1",
  "INFAPL": "informatica aplicada",
'@
$conteudo = Substituir $conteudo $buscaInfapl $novoInfapl "adicao da sigla INFAPL"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Bug de normalizacao corrigido e INFAPL adicionado." -ForegroundColor Green
