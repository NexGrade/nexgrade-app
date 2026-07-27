# Adiciona uma excecao pontual em getEscolaId: se o usuario logado for
# EXATAMENTE o userId configurado na variavel de ambiente
# MIGRACAO_ESCOLA_DEFAULT_USER_ID, o escolaId resolvido e "escola_default"
# em vez do userId dele -- assim ele volta a enxergar a escola piloto
# ja cadastrada, sem mexer na logica geral de multi-tenant (que
# continua correta pra qualquer usuario/escola futura).
#
# Isso resolve a situacao pontual: o login antigo (Development) sempre
# caia em "escola_default" por algum motivo nao totalmente explicado;
# o login novo (Production) resolve certinho pro userId de verdade, o
# que "esconde" a escola piloto ja existente. Esse override reconecta
# esse usuario especifico a ela, sem migrar o ID no banco (mais
# arriscado) nem alterar o comportamento pra qualquer usuario futuro.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\corrigir-escola-id-migracao.ps1

$caminho = "artifacts\api-server\src\lib\escola-id.ts"

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
export function getEscolaId(req: Request): string {
  const auth = (req as any).auth;
  return auth?.orgId ?? auth?.userId ?? "escola_default";
}
'@
$novo = @'
export function getEscolaId(req: Request): string {
  const auth = (req as any).auth;
  const resolvido = auth?.orgId ?? auth?.userId ?? "escola_default";
  // [MIGRACAO TEMPORARIA] Ver comentario no topo do script que gerou
  // este trecho. Reconecta um usuario especifico (o dono da escola
  // piloto ja cadastrada sob "escola_default") a ela, apos a migracao
  // do Clerk para producao ter passado a resolver um userId real em
  // vez de cair no fallback. Remover quando a migracao completa de
  // dados (escola_default -> orgId real) for feita.
  const usuarioMigracao = process.env.MIGRACAO_ESCOLA_DEFAULT_USER_ID;
  if (usuarioMigracao && auth?.userId === usuarioMigracao) {
    return "escola_default";
  }
  return resolvido;
}
'@
$conteudo = Substituir $conteudo $busca $novo "adicao do override de migracao em getEscolaId"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Override de migracao adicionado em getEscolaId." -ForegroundColor Green
