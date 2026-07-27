# Corrige o bug: a checagem de "professor em 2 lugares ao mesmo tempo"
# comparava so dia+numero da aula, sem considerar o turno -- como o
# numero da aula eh relativo a cada turno (aula 5 do matutino != aula 5
# do vespertino, sao horarios de relogio diferentes), isso gerava
# MUITOS falsos positivos pra professores que dao aula em 2 turnos.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\corrigir-varredura-turno.ps1

$caminho = "scripts\varredura-conflitos-v2.ts"

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
  const porProfessorSlot = new Map<string, typeof horarios>();
  for (const h of horariosFiltrados) {
    const chave = `${h.professorId}-${h.diaSemana}-${h.numeroAula}`;
    if (!porProfessorSlot.has(chave)) porProfessorSlot.set(chave, []);
    porProfessorSlot.get(chave)!.push(h);
  }
'@
$novo = @'
  const porProfessorSlot = new Map<string, typeof horarios>();
  for (const h of horariosFiltrados) {
    // [FIX] inclui o turno na chave -- "aula 5" do matutino e "aula 5"
    // do vespertino sao horarios de relogio diferentes, entao um
    // professor pode (e frequentemente deve) dar aula nos dois ao
    // mesmo tempo sem conflito nenhum.
    const turno = turmaMap.get(h.turmaId)?.turno ?? "desconhecido";
    const chave = `${h.professorId}-${turno}-${h.diaSemana}-${h.numeroAula}`;
    if (!porProfessorSlot.has(chave)) porProfessorSlot.set(chave, []);
    porProfessorSlot.get(chave)!.push(h);
  }
'@
$conteudo = Substituir $conteudo $busca $novo "inclusao do turno na chave de deteccao de duplicidade"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Deteccao de professor duplicado agora considera o turno." -ForegroundColor Green
