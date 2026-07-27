# Corrige o script de dry-run: dicionario de siglas com os nomes REAIS
# das disciplinas (confirmados no banco) e mapeamento especial pros
# professores "Hibrida" (hifen no PDF, parenteses no banco).
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\corrigir-mapeamento-dryrun.ps1

$caminho = "scripts\dry-run-importar-noturno.ts"

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

# ── 1. Substitui o dicionario de siglas por nomes reais confirmados no banco ──
$buscaDicionario = @'
const ABREV_PARA_NOME: Record<string, string> = {
  "MAT.": "matematica",
  "PORT": "lingua portuguesa",
  "GEO": "geografia",
  "BIO": "biologia",
  "QUIM": "quimica",
  "ART": "arte",
  "ED.FIS": "educacao fisica",
  "INGLES": "lingua inglesa",
  "ED.FIN": "educacao financeira",
  "ED.DIG": "educacao digital",
  "HIB": "hibrida",
  "HIST": "historia",
  "FISIC": "fisica",
  "FILOS": "filosofia",
  "SOCIO": "sociologia",
  "VIDA": "projeto de vida",
  "MAT 2": "matematica 2",
  "BIO2": "biologia 2",
  "FIS2": "fisica 2",
  "FIS3": "fisica 3",
  "QUI1": "quimica 1",
  "R PORT": "rec aprend l port",
  "R MAT": "rec aprend matematica",
  "ART2": "arte 2",
  "GEO1": "geografia 1",
  "HIS1": "historia 1",
  "SOCIO1": "sociologia 1",
  "EMPRES": "informatica empresarial",
  "ECON.": "principios economicos",
  "FINAN.": "financas empresariais",
  "PR.ADM": "princ de administracao",
  "RH": "recursos humanos",
  "E.MARK": "estrategias de marketing",
  "INTEG.": "tecnicas integradas",
};
'@
$novoDicionario = @'
const ABREV_PARA_NOME: Record<string, string> = {
  "MAT.": "matematica",
  "PORT": "lingua portuguesa e literatura",
  "GEO": "geografia",
  "BIO": "biologia",
  "QUIM": "quimica",
  "ART": "arte",
  "ED.FIS": "educacao fisica",
  "INGLES": "lingua estrangeira moderna - ingles",
  "ED.FIN": "educacao financeira",
  "ED.DIG": "educacao digital",
  "HIB": "hibrida",
  "HIST": "historia",
  "FISIC": "fisica",
  "FILOS": "filosofia",
  "SOCIO": "sociologia",
  "VIDA": "projeto de vida",
  "MAT 2": "matematica 2",
  "BIO2": "biologia 2",
  "FIS2": "fisica 2",
  "FIS3": "fisica 3",
  "QUI1": "quimica 1",
  // [ATENCAO] Ha 2 disciplinas parecidas no banco: "Recomposicao da
  // Aprendizagem - Lingua Portuguesa" e "Leitura e Recomposicao da
  // Aprendizagem - Lingua Portuguesa". Assumido a SEM "Leitura e" --
  // confirme no resultado do dry-run se e essa mesmo.
  "R PORT": "recomposicao da aprendizagem - lingua portuguesa",
  "R MAT": "recomposicao da aprendizagem - matematica",
  "ART2": "arte 2",
  "GEO1": "geografia 1",
  "HIS1": "historia 1",
  "SOCIO1": "sociologia 1",
  "EMPRES": "informatica empresarial",
  "ECON.": "principios economicos",
  "FINAN.": "financas empresariais",
  "PR.ADM": "princ de administracao",
  "RH": "recursos humanos",
  // [ATENCAO] Ha 2 disciplinas parecidas: "Estrategia de Marketing"
  // (singular) e "Estrategias de Marketing" (plural). Assumido a
  // PLURAL, que bate com o nome usado no documento curricular oficial.
  "E.MARK": "estrategias de marketing",
  "INTEG.": "tecnicas integradas",
};
'@
$conteudo = Substituir $conteudo $buscaDicionario $novoDicionario "dicionario de siglas"

# ── 2. Adiciona resolucao especial pros professores Hibrida (hifen -> parenteses) ──
$buscaProf = @'
    const nomeProfNorm = normalizar(item.professor);
    let prof = professorPorNomeCompleto.get(nomeProfNorm);
    if (!prof) {
'@
$novoProf = @'
    const nomeProfNorm = normalizar(item.professor);
    let prof = professorPorNomeCompleto.get(nomeProfNorm);
    // [FIX] No PDF os professores virtuais aparecem como "HIBRIDA-1NB"
    // (hifen), mas no banco estao cadastrados como "Hibrida (1NB)"
    // (parenteses, ligado via professor_disciplinas). Trata esse caso
    // especial antes de cair no fallback de "nao encontrado".
    if (!prof) {
      const mHibrida = item.professor.match(/^HIBRIDA-(.+)$/i);
      if (mHibrida) {
        const alvo = normalizar(`Hibrida (${mHibrida[1]})`);
        prof = professores.find((p) => normalizar(p.nome) === alvo);
      }
    }
    if (!prof) {
'@
$conteudo = Substituir $conteudo $buscaProf $novoProf "resolucao especial dos professores Hibrida"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Dicionario de siglas e mapeamento dos professores Hibrida corrigidos." -ForegroundColor Green
