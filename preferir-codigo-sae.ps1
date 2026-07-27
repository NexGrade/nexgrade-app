# Para as siglas ambiguas (R PORT e E.MARK, que batem com 2 disciplinas
# parecidas no banco), passa a escolher automaticamente a que tem
# codigoSae preenchido -- sinal de que e a disciplina "oficial" ativa,
# em vez de adivinhar pelo texto do nome.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\preferir-codigo-sae.ps1

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

# ── 1. Remove as duas entradas ambiguas do dicionario simples (agora resolvidas a parte) ──
$buscaRemover = @'
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
$novoRemover = @'
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
  "INTEG.": "tecnicas integradas",
};

// Siglas cuja disciplina correspondente e AMBIGUA no banco (existe mais
// de uma disciplina com nome parecido). Resolvidas escolhendo a
// candidata que tem codigoSae preenchido -- sinal de que e a
// disciplina "oficial" ativa, em vez de adivinhar pelo texto.
const CANDIDATOS_AMBIGUOS: Record<string, string[]> = {
  "R PORT": [
    "recomposicao da aprendizagem - lingua portuguesa",
    "leitura e recomposicao da aprendizagem - lingua portuguesa",
  ],
  "E.MARK": ["estrategias de marketing", "estrategia de marketing"],
};

function resolverDisciplinaAmbigua(
  abrev: string,
  disciplinaPorNomeNorm: Map<string, typeof disciplinas[number]>,
): typeof disciplinas[number] | undefined {
  const nomesCandidatos = CANDIDATOS_AMBIGUOS[abrev];
  if (!nomesCandidatos) return undefined;
  const candidatas = nomesCandidatos
    .map((n) => disciplinaPorNomeNorm.get(n))
    .filter((d): d is typeof disciplinas[number] => d != null);
  if (candidatas.length === 0) return undefined;
  const comSae = candidatas.find((d) => d.codigoSae);
  return comSae ?? candidatas[0];
}
'@
$conteudo = Substituir $conteudo $buscaRemover $novoRemover "remocao das entradas ambiguas + funcao de desambiguacao"

# ── 2. Usa a funcao de desambiguacao antes do caminho normal de resolucao de disciplina ──
$buscaResolucao = @'
    const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
    if (!nomeBusca) {
      problemas.push({ motivo: `Sigla de disciplina "${item.disciplinaAbrev}" sem tradução conhecida`, item });
      continue;
    }
    const disc = disciplinaPorNomeNorm.get(nomeBusca);
    if (!disc) {
      problemas.push({ motivo: `Disciplina "${nomeBusca}" (de "${item.disciplinaAbrev}") nao encontrada no banco`, item });
      continue;
    }
'@
$novoResolucao = @'
    let disc: typeof disciplinas[number] | undefined;
    if (CANDIDATOS_AMBIGUOS[item.disciplinaAbrev]) {
      disc = resolverDisciplinaAmbigua(item.disciplinaAbrev, disciplinaPorNomeNorm);
      if (!disc) {
        problemas.push({ motivo: `Disciplina ambigua "${item.disciplinaAbrev}" -- nenhuma das candidatas encontrada no banco`, item });
        continue;
      }
    } else {
      const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
      if (!nomeBusca) {
        problemas.push({ motivo: `Sigla de disciplina "${item.disciplinaAbrev}" sem tradução conhecida`, item });
        continue;
      }
      disc = disciplinaPorNomeNorm.get(nomeBusca);
      if (!disc) {
        problemas.push({ motivo: `Disciplina "${nomeBusca}" (de "${item.disciplinaAbrev}") nao encontrada no banco`, item });
        continue;
      }
    }
'@
$conteudo = Substituir $conteudo $buscaResolucao $novoResolucao "uso da desambiguacao por codigoSae"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! R PORT e E.MARK agora resolvem escolhendo a disciplina com codigoSae preenchido." -ForegroundColor Green
