# Corrige a rota /gerar-cpsat em horarios.ts: antes ela descartava
# qualquer linha de turma_disciplinas com professorId nulo (caso das
# aulas "Hibrida"). Agora resolve o professor pelo mesmo fallback que
# o motor heuristico ja usa (professor_disciplinas), priorizando o
# professor cujo nome contem "(<nome da turma>)" -- convencao ja usada
# nos professores virtuais Hibrida (1NB), Hibrida (2NB), etc.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\corrigir-hibrida-cpsat.ps1

$caminho = "artifacts\api-server\src\routes\horarios.ts"

if (-not (Test-Path $caminho)) {
    Write-Error "Arquivo nao encontrado: $caminho -- rode este script na raiz do projeto (C:\Projetos\nexgrade-app)."
    exit 1
}

$conteudo = Get-Content -Path $caminho -Raw -Encoding UTF8

function Substituir($original, $busca, $novo, $descricao) {
    if (-not $original.Contains($busca)) {
        Write-Error "Nao encontrei o trecho esperado para: $descricao. Nada foi alterado. Avise o Claude com este erro."
        exit 1
    }
    return $original.Replace($busca, $novo)
}

# ── 1. Adiciona a consulta a professorDisciplinasTable no Promise.all ──
$buscaQuery = @'
  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),
  ]);
'@
$novoQuery = @'
  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno, profDiscsTodos] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),
    db.select().from(professorDisciplinasTable),
  ]);
'@
$conteudo = Substituir $conteudo $buscaQuery $novoQuery "query de professorDisciplinasTable"

# ── 2. Substitui o mapeamento de disciplinasTurma por uma versao que resolve o professor via fallback ──
$buscaMap = @'
  const disciplinasTurma = turmaDiscsTodos
    .filter((td) => td.professorId != null)
    .map((td) => {
      const turma = turmaMap.get(td.turmaId)!;
      const disc = disciplinaMap.get(td.disciplinaId);
      const prof = professorMap.get(td.professorId!);
      const codigoSae = disc?.codigoSae ?? disc?.sigla ?? String(td.disciplinaId);
      chaveParaIds.set(`${turma.nome}||${codigoSae}`, { turmaId: td.turmaId, disciplinaId: td.disciplinaId });
      return {
        turma: turma.nome,
        codigoSae,
        nome: disc?.nome ?? `Disciplina #${td.disciplinaId}`,
        aulasSemana: td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,
        professor: prof?.nome ?? `Professor #${td.professorId}`,
        maxAulasDia: td.maxAulasConsecutivasDia ?? 2,
      };
    })
    .filter((d) => d.aulasSemana > 0);
'@
$novoMap = @'
  // [FIX] Quando turma_disciplinas.professorId e nulo (caso das aulas
  // "Hibrida", entre outras), o motor heuristico ja resolve isso via
  // professor_disciplinas (vinculo generico professor<->disciplina).
  // O CP-SAT precisa do mesmo fallback -- sem ele, a linha inteira era
  // descartada e a aula sumia da grade gerada (constatado comparando
  // com a carga horaria real do PDF da escola: toda turma com entrada
  // "Hibrida" ficava faltando exatamente 1 aula). Quando ha mais de um
  // candidato no pool generico, prioriza o professor cujo nome contem
  // "(<nome da turma>)" -- convencao ja usada nos professores virtuais
  // Hibrida (1NB), Hibrida (2NB) etc. -- e cai pro primeiro candidato
  // do pool se nao achar esse padrao.
  function resolverProfessor(td: typeof turmaDiscsTodos[number], turma: typeof turmasDoTurno[number]) {
    if (td.professorId != null) return professorMap.get(td.professorId) ?? null;
    const candidatos = profDiscsTodos
      .filter((pd) => pd.disciplinaId === td.disciplinaId)
      .map((pd) => professorMap.get(pd.professorId))
      .filter((p): p is NonNullable<typeof p> => p != null);
    const porNomeTurma = candidatos.find((p) => p.nome.includes(`(${turma.nome})`));
    return porNomeTurma ?? candidatos[0] ?? null;
  }

  const semProfessorResolvido: Array<{ turma: string; disciplina: string }> = [];

  const disciplinasTurma = turmaDiscsTodos
    .map((td) => {
      const turma = turmaMap.get(td.turmaId)!;
      const disc = disciplinaMap.get(td.disciplinaId);
      const prof = resolverProfessor(td, turma);
      if (!prof) {
        semProfessorResolvido.push({ turma: turma.nome, disciplina: disc?.nome ?? `Disciplina #${td.disciplinaId}` });
        return null;
      }
      const codigoSae = disc?.codigoSae ?? disc?.sigla ?? String(td.disciplinaId);
      chaveParaIds.set(`${turma.nome}||${codigoSae}`, { turmaId: td.turmaId, disciplinaId: td.disciplinaId });
      return {
        turma: turma.nome,
        codigoSae,
        nome: disc?.nome ?? `Disciplina #${td.disciplinaId}`,
        aulasSemana: td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,
        professor: prof.nome,
        maxAulasDia: td.maxAulasConsecutivasDia ?? 2,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .filter((d) => d.aulasSemana > 0);
'@
$conteudo = Substituir $conteudo $buscaMap $novoMap "mapeamento disciplinasTurma com fallback de professor"

# ── 3. Atualiza professorIdsUsados pra incluir os professores resolvidos via fallback (nao so td.professorId direto) ──
$buscaUsados = @'
  const professorIdsUsados = new Set(turmaDiscsTodos.map((td) => td.professorId).filter((id): id is number => id != null));
'@
$novoUsados = @'
  const professorIdsUsados = new Set(disciplinasTurma.map((d) => nomeParaProfessorId.get(d.professor)).filter((id): id is number => id != null));
'@
$conteudo = Substituir $conteudo $buscaUsados $novoUsados "professorIdsUsados considerando fallback"

# ── 4. Inclui aviso sobre disciplinas sem professor resolvido na resposta final, se houver ──
$buscaResposta = @'
  res.json({
    nomeExperimental,
    turno,
    status: resultado.status,
    otimo: resultado.otimo,
    tempoResolucaoS: resultado.tempoResolucaoS,
    totalTurmas: turmasDoTurno.length,
    totalSlots: gravados.length,
    naoMapeadas: naoMapeadas.length,
    ...(naoMapeadas.length > 0 ? { detalheNaoMapeadas: naoMapeadas } : {}),
    mensagem: `Grade gerada como experimento "${nomeExperimental}". Revise e use POST /experimentais/${nomeExperimental}/promover para aplicar como oficial.`,
  });
'@
$novoResposta = @'
  res.json({
    nomeExperimental,
    turno,
    status: resultado.status,
    otimo: resultado.otimo,
    tempoResolucaoS: resultado.tempoResolucaoS,
    totalTurmas: turmasDoTurno.length,
    totalSlots: gravados.length,
    naoMapeadas: naoMapeadas.length,
    semProfessorResolvido: semProfessorResolvido.length,
    ...(naoMapeadas.length > 0 ? { detalheNaoMapeadas: naoMapeadas } : {}),
    ...(semProfessorResolvido.length > 0 ? { detalheSemProfessorResolvido: semProfessorResolvido } : {}),
    mensagem: `Grade gerada como experimento "${nomeExperimental}". Revise e use POST /experimentais/${nomeExperimental}/promover para aplicar como oficial.`,
  });
'@
$conteudo = Substituir $conteudo $buscaResposta $novoResposta "aviso de disciplinas sem professor resolvido"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Fallback de professor (Hibrida e afins) corrigido na rota gerar-cpsat." -ForegroundColor Green
