/**
 * aplicar-turno-parcial.cjs
 *
 * Adiciona a aba "Turno Parcial (Beta)" ao modal de geracao CP-SAT em
 * artifacts/horario-escolar/src/pages/horario/index.tsx, sem tocar em
 * nada que ja existe (Turma Beta e Turno inteiro Beta continuam iguais).
 *
 * Estrategia de ancoragem: usa marcadores curtos e unicos (uma linha,
 * so ASCII) em vez de blocos multi-linha exatos -- evita falha por
 * diferenca sutil de espacamento/indentacao na hora de bater a ancora.
 *
 * Uso:
 *   node aplicar-turno-parcial.cjs            (dry-run: escreve preview, nao mexe no arquivo real)
 *   node aplicar-turno-parcial.cjs --aplicar   (faz backup do arquivo real e aplica de fato)
 */

const fs = require('fs');
const path = require('path');

const ALVO = path.join('artifacts', 'horario-escolar', 'src', 'pages', 'horario', 'index.tsx');
const APLICAR = process.argv.includes('--aplicar');

function acharUnico(conteudo, marcador, label) {
  const idx = conteudo.indexOf(marcador);
  if (idx === -1) {
    throw new Error(`[FALHA] Marcador nao encontrado para "${label}": ${JSON.stringify(marcador)}`);
  }
  const idx2 = conteudo.indexOf(marcador, idx + 1);
  if (idx2 !== -1) {
    throw new Error(`[FALHA] Marcador de "${label}" aparece mais de uma vez -- abortando por seguranca.`);
  }
  return idx;
}

function inserirDepoisDoProximo(conteudo, marcador, procurarDepois, novoTrecho, label) {
  const idxMarcador = acharUnico(conteudo, marcador, label + ' (marcador)');
  const idxAlvo = conteudo.indexOf(procurarDepois, idxMarcador);
  if (idxAlvo === -1) {
    throw new Error(`[FALHA] "${procurarDepois}" nao encontrado apos o marcador de "${label}".`);
  }
  const ponto = idxAlvo + procurarDepois.length;
  return conteudo.slice(0, ponto) + novoTrecho + conteudo.slice(ponto);
}

function inserirAntesDoAnterior(conteudo, marcador, procurarAntes, novoTrecho, label) {
  const idxMarcador = acharUnico(conteudo, marcador, label + ' (marcador)');
  const idxAlvo = conteudo.lastIndexOf(procurarAntes, idxMarcador);
  if (idxAlvo === -1) {
    throw new Error(`[FALHA] "${procurarAntes}" nao encontrado antes do marcador de "${label}".`);
  }
  return conteudo.slice(0, idxAlvo) + novoTrecho + conteudo.slice(idxAlvo);
}

function main() {
  if (!fs.existsSync(ALVO)) {
    throw new Error(`Arquivo alvo nao encontrado: ${ALVO} (rode a partir da raiz do projeto)`);
  }
  const bruto = fs.readFileSync(ALVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');
  const tamanhoOriginal = conteudo.length;

  // 1) Nova chave de sessionStorage
  conteudo = inserirDepoisDoProximo(
    conteudo,
    'const CPSAT_TURMA_JOB_PENDENTE_KEY = "nexgrade:cpsat-turma-job-pendente";',
    'const CPSAT_TURMA_JOB_PENDENTE_KEY = "nexgrade:cpsat-turma-job-pendente";',
    `\n\n// Chave separada pra job pendente de Turno Parcial (Beta), mesmo\n// motivo da chave de turma unica: nao colidir com os outros jobs CP-SAT\n// se ficarem pendentes ao mesmo tempo.\nconst CPSAT_TURNO_PARCIAL_JOB_PENDENTE_KEY = "nexgrade:cpsat-turno-parcial-job-pendente";`,
    'chave de sessionStorage'
  );

  // 2) Novo estado -- marcador curto + procura o proximo "\n  });"
  conteudo = inserirDepoisDoProximo(
    conteudo,
    'setCpsatTurmaForm] = useState({',
    '\n  });',
    `\n\n  // [NOVO] Turno Parcial (Beta): mesmo motor de turma(s), mas com um\n  // seletor de turno primeiro -- so mostra as turmas DAQUELE turno pra\n  // marcar, em vez da lista misturada do "Turma(s) Beta". Reaproveita a\n  // mesma rota/parametro turmaIds[] do backend, sem mudanca nenhuma la.\n  const [openGerarCpsatTurnoParcial, setOpenGerarCpsatTurnoParcial] = useState(false);\n  const [gerandoCpsatTurnoParcial, setGerandoCpsatTurnoParcial] = useState(false);\n  const [cpsatTurnoParcialForm, setCpsatTurnoParcialForm] = useState({\n    turno: "matutino" as "matutino" | "vespertino" | "noturno",\n    turmaIds: [] as string[],\n    nomeExperimental: \`CPSAT-\${new Date().toISOString().split("T")[0]}\`,\n  });`,
    'estado do Turno Parcial'
  );

  // 3) Funcoes + useEffect de retomada
  const blocoFuncoes = `

  // Mesma logica de finalizarJobCpsatTurma, mas pro fluxo de Turno
  // Parcial -- reaproveita pollarStatusCpsat integralmente, so muda o
  // estado/toast especificos e a chave de sessionStorage.
  const finalizarJobCpsatTurnoParcial = async (jobId: string, nomeExperimental: string, turmaIds: number[]) => {
    try {
      const statusResult = await pollarStatusCpsat(jobId);
      if (statusResult.jobStatus === "error") {
        throw new Error(statusResult.mensagem || statusResult.detalhe || statusResult.error || "Erro ao gerar a grade com o motor CP-SAT.");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: \`Grade CP-SAT gerada! \${statusResult.totalSlots} aulas criadas.\`,
        description: statusResult.status === "OPTIMAL"
          ? \`Solucao otima em \${statusResult.tempoResolucaoS}s (sem janelas evitaveis).\`
          : \`Status: \${statusResult.status}. Confira antes de promover.\`,
      });
      setOpenGerarCpsatTurnoParcial(false);
      setNomeExpandido(nomeExperimental);
      setTurmaExpandidaId(turmaIds.length === 1 ? turmaIds[0] : null);
    } catch (err) {
      const mensagemErro = err instanceof Error ? err.message : String(err);
      if (mensagemErro !== "JOB_NAO_ENCONTRADO") {
        toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    } finally {
      setGerandoCpsatTurnoParcial(false);
      try {
        sessionStorage.removeItem(CPSAT_TURNO_PARCIAL_JOB_PENDENTE_KEY);
      } catch {
        // sessionStorage indisponivel -- nao ha o que fazer.
      }
    }
  };

  const handleGerarCpsatTurnoParcial = async () => {
    if (cpsatTurnoParcialForm.turmaIds.length === 0) { toast({ title: "Selecione ao menos uma turma", variant: "destructive" }); return; }
    if (!cpsatTurnoParcialForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsatTurnoParcial(true);
    try {
      const turmaIdsNum = cpsatTurnoParcialForm.turmaIds.map(Number);
      const corpoRequisicao = turmaIdsNum.length === 1
        ? { turmaId: turmaIdsNum[0], nomeExperimental: cpsatTurnoParcialForm.nomeExperimental }
        : { turmaIds: turmaIdsNum, nomeExperimental: cpsatTurnoParcialForm.nomeExperimental };
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoRequisicao),
        responseType: "json",
      });
      try {
        sessionStorage.setItem(
          CPSAT_TURNO_PARCIAL_JOB_PENDENTE_KEY,
          JSON.stringify({ jobId: inicio.jobId, nomeExperimental: cpsatTurnoParcialForm.nomeExperimental, turmaIds: turmaIdsNum }),
        );
      } catch {
        // sessionStorage indisponivel -- retomada automatica nao vai
        // funcionar, mas o fluxo normal (aba aberta) segue igual.
      }
      await finalizarJobCpsatTurnoParcial(inicio.jobId, cpsatTurnoParcialForm.nomeExperimental, turmaIdsNum);
    } catch (err) {
      setGerandoCpsatTurnoParcial(false);
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  // [FIX-PERSISTENCIA] Retomada automatica do job CP-SAT de Turno
  // Parcial pendente -- mesma ideia dos outros dois, chave separada.
  useEffect(() => {
    let pendente: { jobId: string; nomeExperimental: string; turmaIds?: number[] } | null = null;
    try {
      const raw = sessionStorage.getItem(CPSAT_TURNO_PARCIAL_JOB_PENDENTE_KEY);
      if (raw) pendente = JSON.parse(raw);
    } catch {
      pendente = null;
    }
    if (!pendente?.jobId) return;
    const turmaIdsPendente = pendente.turmaIds ?? [];
    setGerandoCpsatTurnoParcial(true);
    setOpenGerarCpsatTurnoParcial(true);
    setCpsatTurnoParcialForm((f) => ({
      ...f,
      nomeExperimental: pendente!.nomeExperimental || f.nomeExperimental,
      turmaIds: turmaIdsPendente.map(String),
    }));
    toast({
      title: "Retomando geracao com CP-SAT...",
      description: "A pagina foi recarregada antes do resultado chegar -- continuando de onde parou.",
    });
    void finalizarJobCpsatTurnoParcial(pendente.jobId, pendente.nomeExperimental, turmaIdsPendente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);`;

  conteudo = inserirDepoisDoProximo(
    conteudo,
    'void finalizarJobCpsatTurma(pendente.jobId, pendente.nomeExperimental, turmaIdsPendente);',
    '}, []);',
    blocoFuncoes,
    'funcoes e useEffect do Turno Parcial'
  );

  // 4) Novo botao -- insere antes do <Button> do "Turno inteiro (Beta)"
  conteudo = inserirAntesDoAnterior(
    conteudo,
    'onClick={() => setOpenGerarCpsat(true)}>',
    '<Button',
    `<Button variant="outline" className="w-full justify-start border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setOpenGerarCpsatTurnoParcial(true)}>\n                <Sparkles className="w-4 h-4 mr-2" />Turno Parcial (Beta)\n              </Button>\n              `,
    'botao Turno Parcial'
  );

  // 5) Novo Dialog -- insere depois do proximo "</Dialog>" apos o
  //    botao de gerar do modal "Turma (Beta)"
  const novoDialog = `

      <Dialog open={openGerarCpsatTurnoParcial} onOpenChange={setOpenGerarCpsatTurnoParcial}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar com CP-SAT -- Turno Parcial (Beta)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-md p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
              Escolha um turno e depois marque so as turmas que devem entrar neste calculo. Util pra dividir turnos grandes em pedacos menores (evita estourar memoria no CP-SAT). As turmas de fora do lote nao sao alteradas, e o motor ja evita colidir com os professores delas.
            </div>
            <div className="space-y-1.5">
              <Label>Nome do experimento *</Label>
              <Input value={cpsatTurnoParcialForm.nomeExperimental} onChange={(e) => setCpsatTurnoParcialForm((f) => ({ ...f, nomeExperimental: e.target.value }))} placeholder="Ex: CPSAT-Parcial-2026-08-13" />
            </div>
            <div className="space-y-1.5">
              <Label>Turno *</Label>
              <Select
                value={cpsatTurnoParcialForm.turno}
                onValueChange={(v) => setCpsatTurnoParcialForm((f) => ({ ...f, turno: v as "matutino" | "vespertino" | "noturno", turmaIds: [] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matutino">Matutino</SelectItem>
                  <SelectItem value="vespertino">Vespertino</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Turmas do turno selecionado *</Label>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {turmas.filter((t) => t.turno === cpsatTurnoParcialForm.turno).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={cpsatTurnoParcialForm.turmaIds.includes(String(t.id))}
                      onChange={(e) => {
                        const id = String(t.id);
                        setCpsatTurnoParcialForm((f) => ({
                          ...f,
                          turmaIds: e.target.checked ? [...f.turmaIds, id] : f.turmaIds.filter((x) => x !== id),
                        }));
                      }}
                    />
                    {t.nome}
                  </label>
                ))}
                {turmas.filter((t) => t.turno === cpsatTurnoParcialForm.turno).length === 0 && (
                  <p className="text-xs text-muted-foreground px-1 py-0.5">Nenhuma turma cadastrada neste turno.</p>
                )}
              </div>
              {cpsatTurnoParcialForm.turmaIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{cpsatTurnoParcialForm.turmaIds.length} turma(s) selecionada(s).</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarCpsatTurnoParcial(false)}>Cancelar</Button>
            <Button onClick={handleGerarCpsatTurnoParcial} disabled={gerandoCpsatTurnoParcial}>{gerandoCpsatTurnoParcial ? "Gerando (pode levar ate 2 min)..." : "Gerar com CP-SAT"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>`;

  conteudo = inserirDepoisDoProximo(
    conteudo,
    'onClick={handleGerarCpsatTurma} disabled={gerandoCpsatTurma}>',
    '</Dialog>',
    novoDialog,
    'dialog do Turno Parcial'
  );

  const tamanhoFinal = conteudo.length;
  console.log(`Insercoes aplicadas com sucesso. Tamanho: ${tamanhoOriginal} -> ${tamanhoFinal} caracteres (+${tamanhoFinal - tamanhoOriginal}).`);

  const conteudoFinal = usaCRLF ? conteudo.replace(/\n/g, '\r\n') : conteudo;

  if (APLICAR) {
    const backupPath = ALVO + `.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(ALVO, backupPath);
    fs.writeFileSync(ALVO, conteudoFinal, { encoding: 'utf8' });
    console.log(`\n✅ Aplicado. Backup do original salvo em: ${backupPath}`);
    console.log('Rode "npx tsc --noEmit" pra conferir se compila.');
  } else {
    const previewPath = ALVO + '.preview-turno-parcial.tsx';
    fs.writeFileSync(previewPath, conteudoFinal, { encoding: 'utf8' });
    console.log(`\n↩️  DRY-RUN -- nada foi alterado no arquivo real.`);
    console.log(`Preview completo salvo em: ${previewPath}`);
    console.log('Revise esse arquivo (ou rode com --aplicar pra aplicar de fato, com backup automatico).');
  }
}

main();
