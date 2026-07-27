# Move o UserButton (avatar/menu de conta do Clerk) do cabecalho pra
# dentro do menu lateral, logo abaixo de "Configuracoes" (ultimo item
# do grupo "Sistema") -- fica no mesmo estilo visual dos outros itens
# do menu, em vez de sozinho no canto superior direito.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\mover-userbutton.ps1

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

# 1) remove o UserButton do cabecalho, deixando o header vazio (so a faixa)
$busca1 = @'
        <header className="h-16 flex items-center px-8 border-b border-border bg-card gap-4">
          <div className="flex-1" />
          <UserButton />
        </header>
'@
$novo1 = @'
        <header className="h-16 flex items-center px-8 border-b border-border bg-card gap-4">
          <div className="flex-1" />
        </header>
'@
$conteudo = Substituir $conteudo $busca1 $novo1 "remocao do UserButton do cabecalho"

# 2) adiciona o UserButton logo apos o loop dos grupos, ainda dentro do <nav>,
#    o que o coloca visualmente logo abaixo de "Configuracoes" (ultimo item
#    do ultimo grupo, "Sistema")
$busca2 = @'
          ))}
        </nav>
      </aside>
'@
$novo2 = @'
          ))}
          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground">
              <UserButton afterSignOutUrl="/" />
              <span className="flex-1">Minha conta</span>
            </div>
          </div>
        </nav>
      </aside>
'@
$conteudo = Substituir $conteudo $busca2 $novo2 "adicao do UserButton no menu lateral"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! UserButton movido para o menu lateral, abaixo de Configuracoes." -ForegroundColor Green
