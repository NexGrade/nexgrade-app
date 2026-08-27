# aplicar-multi-turma-cpsat.ps1
#
# Aplica 6 substituicoes ciruricas em index.tsx pra transformar o modal
# "Gerar com CP-SAT -- Turma (Beta)" de selecao unica pra selecao
# multipla de turmas (checkboxes). Cada edicao usa um marcador de INICIO
# e um de FIM (linhas curtas e unicas no arquivo) -- o script encontra
# esses marcadores, substitui o trecho entre eles, e AVISA CLARAMENTE se
# algum marcador nao for encontrado (sem aplicar nada silenciosamente
# errado). Roda sempre em modo dry-run primeiro; use -Aplicar para gravar.
#
# Uso:
#   .\aplicar-multi-turma-cpsat.ps1                 # dry-run (so mostra o que faria)
#   .\aplicar-multi-turma-cpsat.ps1 -Aplicar         # aplica de verdade

param(
    [switch]$Aplicar
)

$ErrorActionPreference = "Stop"
$caminhoArquivo = "artifacts\horario-escolar\src\pages\horario\index.tsx"

if (-not (Test-Path $caminhoArquivo)) {
    Write-Error "Nao encontrei $caminhoArquivo -- rode este script a partir da raiz do projeto (C:\Projetos\nexgrade-app)."
    exit 1
}

# Le o arquivo inteiro como texto unico, preservando os fins de linha originais.
$conteudoOriginal = [System.IO.File]::ReadAllText((Resolve-Path $caminhoArquivo))
$conteudo = $conteudoOriginal

function Aplicar-Edicao {
    param(
        [string]$Nome,
        [string]$MarcadorInicio,
        [string]$MarcadorFim,
        [string]$NovoTrecho,
        [switch]$IncluirMarcadorFimNoTrecho
    )
    $idxInicio = $script:conteudo.IndexOf($MarcadorInicio)
    if ($idxInicio -lt 0) {
        Write-Error "[$Nome] Marcador de INICIO nao encontrado. O arquivo pode ja ter sido alterado, ou o texto mudou. Abortando sem gravar nada."
        exit 1
    }
    # [FIX-AMBIGUIDADE] Confere se o marcador aparece mais de uma vez no
    # arquivo -- se aparecer, o IndexOf pode estar pegando a ocorrencia
    # ERRADA (foi exatamente o que aconteceu na 1a tentativa deste
    # patch, usando "<Label>Turma *</Label>" como marcador). Avisa em
    # vez de aplicar silenciosamente no lugar errado.
    $segundaOcorrencia = $script:conteudo.IndexOf($MarcadorInicio, $idxInicio + $MarcadorInicio.Length)
    if ($segundaOcorrencia -ge 0) {
        Write-Error "[$Nome] O marcador de INICIO aparece MAIS DE UMA VEZ no arquivo (posicoes $idxInicio e $segundaOcorrencia). Marcador ambiguo -- abortando sem gravar nada, pra nao editar o lugar errado."
        exit 1
    }
    $idxFim = $script:conteudo.IndexOf($MarcadorFim, $idxInicio + $MarcadorInicio.Length)
    if ($idxFim -lt 0) {
        Write-Error "[$Nome] Marcador de FIM nao encontrado apos o inicio. Abortando sem gravar nada."
        exit 1
    }
    $fimSubstituicao = if ($IncluirMarcadorFimNoTrecho) { $idxFim + $MarcadorFim.Length } else { $idxFim }
    $prefixo = $script:conteudo.Substring(0, $idxInicio)
    $sufixo = $script:conteudo.Substring($fimSubstituicao)
    $script:conteudo = $prefixo + $NovoTrecho + $sufixo
    Write-Host "[$Nome] OK -- trecho encontrado e substituido ($($idxFim - $idxInicio) caracteres)."
}

# ── EDICAO 1: estado cpsatTurmaForm (turmaId -> turmaIds) ──────────────
Aplicar-Edicao -Nome "1-estado" `
    -MarcadorInicio '  const [cpsatTurmaForm, setCpsatTurmaForm] = useState({' `
    -MarcadorFim '  // [NOVO] Detalhes por turma do' `
    -IncluirMarcadorFimNoTrecho:$false `
    -NovoTrecho @'
  const [cpsatTurmaForm, setCpsatTurmaForm] = useState({
    turmaIds: [] as string[],
    nomeExperimental: `CPSAT-${new Date().toISOString().split("T")[0]}`,
  });
  // [FIX-MULTI-TURMA] turmaIds agora e uma lista (uma ou mais turmas),
  // nao mais uma unica turma -- ver runCpsatGeneration no backend, que
  // ganhou suporte a turmaIds como terceira opcao alem de turno/turmaId.

'@

# ── EDICAO 2: finalizarJobCpsatTurma (turmaId: number -> turmaIds: number[]) ──
Aplicar-Edicao -Nome "2-finalizarJob" `
    -MarcadorInicio '  const finalizarJobCpsatTurma = async (jobId: string, nomeExperimental: string, turmaId: number) => {' `
    -MarcadorFim '  const handleGerarCpsatTurma = async () => {' `
    -IncluirMarcadorFimNoTrecho:$false `
    -NovoTrecho @'
  const finalizarJobCpsatTurma = async (jobId: string, nomeExperimental: string, turmaIds: number[]) => {
    try {
      const statusResult = await pollarStatusCpsat(jobId);
      if (statusResult.jobStatus === "error") {
        throw new Error(statusResult.mensagem || statusResult.detalhe || statusResult.error || "Erro ao gerar a grade com o motor CP-SAT.");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${statusResult.totalSlots} aulas criadas.`,
        description: statusResult.status === "OPTIMAL"
          ? `Solucao otima em ${statusResult.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${statusResult.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsatTurma(false);
      setNomeExpandido(nomeExperimental);
      // [FIX-MULTI-TURMA] So expande automaticamente a grade de uma
      // turma especifica quando so UMA foi selecionada -- com varias,
      // mostra a lista (mesmo comportamento do turno inteiro).
      setTurmaExpandidaId(turmaIds.length === 1 ? turmaIds[0] : null);
    } catch (err) {
      const mensagemErro = err instanceof Error ? err.message : String(err);
      // JOB_NAO_ENCONTRADO so acontece na retomada automatica (job
      // expirou ou pertence a outra escola) -- encerra em silencio.
      if (mensagemErro !== "JOB_NAO_ENCONTRADO") {
        toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    } finally {
      setGerandoCpsatTurma(false);
      try {
        sessionStorage.removeItem(CPSAT_TURMA_JOB_PENDENTE_KEY);
      } catch {
        // sessionStorage indisponivel -- nao ha o que fazer.
      }
    }
  };

'@

# ── EDICAO 3: handleGerarCpsatTurma (manda turmaId ou turmaIds pro backend) ──
Aplicar-Edicao -Nome "3-handleGerar" `
    -MarcadorInicio '  const handleGerarCpsatTurma = async () => {' `
    -MarcadorFim '  // [FIX-PERSISTENCIA] Retomada automatica do job CP-SAT de turma' `
    -IncluirMarcadorFimNoTrecho:$false `
    -NovoTrecho @'
  const handleGerarCpsatTurma = async () => {
    if (cpsatTurmaForm.turmaIds.length === 0) { toast({ title: "Selecione ao menos uma turma", variant: "destructive" }); return; }
    if (!cpsatTurmaForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsatTurma(true);
    try {
      // [FIX-ASYNC-TURMA] Migrado pra rota assincrona
      // (/gerar-cpsat-async, que ja aceita turmaId), mesmo padrao do
      // turno inteiro -- evita o timeout de ~300s do proxy do Render
      // numa turma pesada e ganha de graca a resiliencia de rede e a
      // retomada automatica (useEffect abaixo) se a aba pausar no
      // meio do processo. customFetch ja anexa o token.
      // [FIX-MULTI-TURMA] Com 1 turma so, manda turmaId (compatibilidade
      // com o formato antigo); com mais de uma, manda turmaIds -- o
      // backend aceita exatamente uma das duas chaves.
      const turmaIdsNum = cpsatTurmaForm.turmaIds.map(Number);
      const corpoRequisicao = turmaIdsNum.length === 1
        ? { turmaId: turmaIdsNum[0], nomeExperimental: cpsatTurmaForm.nomeExperimental }
        : { turmaIds: turmaIdsNum, nomeExperimental: cpsatTurmaForm.nomeExperimental };
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoRequisicao),
        responseType: "json",
      });
      try {
        sessionStorage.setItem(
          CPSAT_TURMA_JOB_PENDENTE_KEY,
          JSON.stringify({
            jobId: inicio.jobId,
            nomeExperimental: cpsatTurmaForm.nomeExperimental,
            turmaIds: turmaIdsNum,
          }),
        );
      } catch {
        // sessionStorage indisponivel -- segue sem persistencia.
      }
      await finalizarJobCpsatTurma(inicio.jobId, cpsatTurmaForm.nomeExperimental, turmaIdsNum);
    } catch (err) {
      // So cai aqui se o POST inicial falhar (antes de existir um
      // jobId) -- finalizarJobCpsatTurma cuida do resto.
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setGerandoCpsatTurma(false);
    }
  };

'@

# ── EDICAO 4: useEffect de retomada automatica (turmaId -> turmaIds) ───
Aplicar-Edicao -Nome "4-useEffectRetomada" `
    -MarcadorInicio '    let pendente: { jobId: string; nomeExperimental: string; turmaId: number } | null = null;' `
    -MarcadorFim '  // Espera o resultado de um job CP-SAT ja em andamento (via' `
    -IncluirMarcadorFimNoTrecho:$false `
    -NovoTrecho @'
    let pendente: { jobId: string; nomeExperimental: string; turmaIds?: number[]; turmaId?: number } | null = null;
    try {
      const raw = sessionStorage.getItem(CPSAT_TURMA_JOB_PENDENTE_KEY);
      if (raw) pendente = JSON.parse(raw);
    } catch {
      pendente = null;
    }
    if (!pendente?.jobId) return;
    // [FIX-MULTI-TURMA] Compatibilidade com jobs pendentes salvos antes
    // desta mudanca (formato antigo tinha turmaId unico, nao turmaIds).
    const turmaIdsPendente = pendente.turmaIds ?? (pendente.turmaId != null ? [pendente.turmaId] : []);
    setGerandoCpsatTurma(true);
    setOpenGerarCpsatTurma(true);
    setCpsatTurmaForm((f) => ({
      ...f,
      nomeExperimental: pendente!.nomeExperimental || f.nomeExperimental,
      turmaIds: turmaIdsPendente.map(String),
    }));
    toast({
      title: "Retomando geracao com CP-SAT...",
      description: "A pagina foi recarregada antes do resultado chegar -- continuando de onde parou.",
    });
    void finalizarJobCpsatTurma(pendente.jobId, pendente.nomeExperimental, turmaIdsPendente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

'@

# ── EDICAO 5: JSX -- troca o <Select> de turma unica por checkboxes ────
# [FIX-MARCADOR] Trocado o marcador de inicio de "<Label>Turma *</Label>"
# (nao-unico -- existe em mais de um modal do arquivo, causou a edicao
# ser aplicada no lugar errado na primeira tentativa) para a linha do
# proprio <Select value={cpsatTurmaForm.turmaId}...>, que so existe UMA
# vez no arquivo por referenciar especificamente cpsatTurmaForm.turmaId.
Aplicar-Edicao -Nome "5-jsx-checkboxes" `
    -MarcadorInicio '              <Select value={cpsatTurmaForm.turmaId} onValueChange={(v) => setCpsatTurmaForm((f) => ({ ...f, turmaId: v }))}>' `
    -MarcadorFim '              </Select>' `
    -IncluirMarcadorFimNoTrecho:$true `
    -NovoTrecho @'
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {turmas.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={cpsatTurmaForm.turmaIds.includes(String(t.id))}
                      onChange={(e) => {
                        const id = String(t.id);
                        setCpsatTurmaForm((f) => ({
                          ...f,
                          turmaIds: e.target.checked ? [...f.turmaIds, id] : f.turmaIds.filter((x) => x !== id),
                        }));
                      }}
                    />
                    {t.nome}
                  </label>
                ))}
              </div>
              {cpsatTurmaForm.turmaIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{cpsatTurmaForm.turmaIds.length} turma(s) selecionada(s) -- todas precisam ser do mesmo turno.</p>
              )}

'@

# Edicao 6 (titulo cosmetico "Turma (Beta)" -> "Turma(s) (Beta)") foi
# removida: usava um travessao (—) que sofreu problema de codificacao
# entre este script e o arquivo real (mesma classe de pegadinha do
# PowerShell 5.1 com BOM/encoding ja documentada neste projeto). Nao
# afeta nada funcional -- so o texto do titulo do modal fica como
# estava. Pode ser renomeado manualmente depois se quiser.

Write-Host "`nTodas as 5 edicoes foram encontradas e aplicadas na memoria."

if ($Aplicar) {
    # Grava sem BOM (Set-Content do PowerShell 5.1 adiciona BOM UTF-8,
    # o que ja causou corrupcao de arquivo antes neste projeto).
    $utf8SemBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $caminhoArquivo), $conteudo, $utf8SemBom)
    Write-Host "`n✅ Arquivo gravado: $caminhoArquivo"
} else {
    $backupPath = "$caminhoArquivo.PREVIEW.txt"
    $utf8SemBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $backupPath), $conteudo, $utf8SemBom)
    Write-Host "`n↩️  DRY-RUN -- nada foi gravado no arquivo original."
    Write-Host "Prevvisualizacao completa salva em: $backupPath (compare com o original antes de aplicar)."
    Write-Host "Rode novamente com -Aplicar para gravar de verdade."
}
