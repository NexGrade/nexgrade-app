# Corrige o alinhamento do UserButton no menu lateral: o avatar do
# Clerk vem com tamanho padrao maior que os icones do menu (16px),
# fazendo a linha parecer centralizada/flutuando em vez de alinhada
# a esquerda como os outros itens. Ajusta o tamanho do avatar via
# appearance.elements do Clerk e garante alinhamento consistente.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\ajustar-userbutton.ps1

$caminho = "artifacts\horario-escolar\src\components\layout.tsx"

if (-not (Test-Path $caminho)) {
    Write-Error "Arquivo nao encontrado: $caminho -- rode este script na raiz do projeto."
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
          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground">
              <UserButton afterSignOutUrl="/" />
              <span className="flex-1">Minha conta</span>
            </div>
          </div>
'@
$novo = @'
          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground">
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      rootBox: "w-4 h-4",
                      userButtonBox: "w-4 h-4",
                      userButtonTrigger: "w-4 h-4",
                      userButtonAvatarBox: "w-4 h-4",
                    },
                  }}
                />
              </span>
              <span className="flex-1 whitespace-nowrap">Minha conta</span>
            </div>
          </div>
'@
$conteudo = Substituir $conteudo $busca $novo "ajuste de alinhamento e tamanho do UserButton"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! UserButton alinhado e redimensionado." -ForegroundColor Green
