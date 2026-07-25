# Adiciona o botao + modal "Gerar com CP-SAT (Beta)" na aba Experimental
# de artifacts\horario-escolar\src\pages\horario\index.tsx, seguindo o
# mesmo padrao visual do botao "Gerar em Massa" que ja existe.
#
# Como rodar (na raiz do projeto, C:\Projetos\nexgrade-app):
#   .\adicionar-botao-cpsat.ps1
#
# O script faz substituicoes de texto EXATAS (nao regex) -- se algum
# trecho nao for encontrado, ele avisa e para, sem alterar nada.

$caminho = "artifacts\horario-escolar\src\pages\horario\index.tsx"

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

# ── 1. Adiciona o icone novo (Sparkles) na lista de imports do lucide-react ──
$buscaIcones = "CheckCircle2, RefreshCw, ChevronUp, ArrowUpCircle, Trash2, Clock, Info, X,`n} from `"lucide-react`";"
$novoIcones = "CheckCircle2, RefreshCw, ChevronUp, ArrowUpCircle, Trash2, Clock, Info, X, Sparkles,`n} from `"lucide-react`";"
$conteudo = Substituir $conteudo $buscaIcones $novoIcones "import do icone Sparkles"

# ── 2. Adiciona o estado (openGerarCpsat, gerandoCpsat, cpsatForm) logo apos o estado do loteForm ──
$buscaEstado = @'
  const [openGerarLote, setOpenGerarLote] = useState(false);
  const [gerandoLote, setGerandoLote] = useState(false);
  const [loteForm, setLoteForm] = useState({
    turno: "matutino",
    nomeExperimental: `Lote-${new Date().toISOString().split("T")[0]}`,
    reduzirJanelas: true,
    fatorPedagogico: false,
    compactarCargaHoraria: false,
  });
'@
$novoEstado = @'
  const [openGerarLote, setOpenGerarLote] = useState(false);
  const [gerandoLote, setGerandoLote] = useState(false);
  const [loteForm, setLoteForm] = useState({
    turno: "matutino",
    nomeExperimental: `Lote-${new Date().toISOString().split("T")[0]}`,
    reduzirJanelas: true,
    fatorPedagogico: false,
    compactarCargaHoraria: false,
  });

  // Motor CP-SAT (OR-Tools) -- alternativa ao heuristico acima, mais
  // preciso pra reduzir janelas. Sempre grava como experimento.
  const [openGerarCpsat, setOpenGerarCpsat] = useState(false);
  const [gerandoCpsat, setGerandoCpsat] = useState(false);
  const [cpsatForm, setCpsatForm] = useState({
    turno: "matutino",
    nomeExperimental: `CPSAT-${new Date().toISOString().split("T")[0]}`,
  });
'@
$conteudo = Substituir $conteudo $buscaEstado $novoEstado "estado do formulario CP-SAT"

# ── 3. Adiciona a funcao handleGerarCpsat logo apos handleGerarLote ──
$buscaHandle = @'
    } catch (err) {
      toast({ title: "Erro ao gerar em massa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoLote(false);
    }
  };
'@
$novoHandle = @'
    } catch (err) {
      toast({ title: "Erro ao gerar em massa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoLote(false);
    }
  };

  const handleGerarCpsat = async () => {
    if (!cpsatForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsat(true);
    try {
      const res = await fetch("/api/horarios/gerar-cpsat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turno: cpsatForm.turno,
          nomeExperimental: cpsatForm.nomeExperimental,
        }),
      });
      if (!res.ok) {
        const erro = await res.json().catch(() => ({}));
        throw new Error(erro.error ?? erro.detalhe ?? "Erro ao gerar com CP-SAT");
      }
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${result.totalTurmas} turma(s), ${result.totalSlots} aulas criadas.`,
        description: result.status === "OPTIMAL"
          ? `Solucao otima em ${result.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${result.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsat(false);
      setNomeExpandido(cpsatForm.nomeExperimental);
      setTurmaExpandidaId(null);
    } catch (err) {
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoCpsat(false);
    }
  };
'@
$conteudo = Substituir $conteudo $buscaHandle $novoHandle "funcao handleGerarCpsat"

# ── 4. Adiciona o botao "Gerar com CP-SAT" ao lado do "Gerar em Massa" ──
$buscaBotao = @'
          <Button variant="outline" onClick={() => setOpenGerarLote(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />Gerar em Massa
          </Button>
        </div>
      </div>
'@
$novoBotao = @'
          <Button variant="outline" onClick={() => setOpenGerarLote(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />Gerar em Massa
          </Button>
          <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setOpenGerarCpsat(true)}>
            <Sparkles className="w-4 h-4 mr-2" />Gerar com CP-SAT (Beta)
          </Button>
        </div>
      </div>
'@
$conteudo = Substituir $conteudo $buscaBotao $novoBotao "botao Gerar com CP-SAT"

# ── 5. Adiciona o Dialog do CP-SAT logo apos o Dialog do "Gerar em Massa" ──
$buscaDialog = @'
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarLote(false)}>Cancelar</Button>
            <Button onClick={handleGerarLote} disabled={gerandoLote}>{gerandoLote ? "Gerando (pode demorar)..." : "Gerar em Massa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
'@
$novoDialog = @'
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarLote(false)}>Cancelar</Button>
            <Button onClick={handleGerarLote} disabled={gerandoLote}>{gerandoLote ? "Gerando (pode demorar)..." : "Gerar em Massa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openGerarCpsat} onOpenChange={setOpenGerarCpsat}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar com CP-SAT (Beta)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-md p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
              Usa o motor CP-SAT (OR-Tools) em vez do gerador heuristico -- mais preciso pra eliminar janelas na grade dos professores. Grava sempre como experimento; nada muda na grade oficial ate voce promover.
            </div>
            <div className="space-y-1.5">
              <Label>Nome do experimento *</Label>
              <Input value={cpsatForm.nomeExperimental} onChange={(e) => setCpsatForm((f) => ({ ...f, nomeExperimental: e.target.value }))} placeholder="Ex: CPSAT-Teste-2026-07-24" />
            </div>
            <div className="space-y-1.5">
              <Label>Turno</Label>
              <Select value={cpsatForm.turno} onValueChange={(v) => setCpsatForm((f) => ({ ...f, turno: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matutino">Matutino</SelectItem>
                  <SelectItem value="vespertino">Vespertino</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarCpsat(false)}>Cancelar</Button>
            <Button onClick={handleGerarCpsat} disabled={gerandoCpsat}>{gerandoCpsat ? "Gerando (pode levar ate 2 min)..." : "Gerar com CP-SAT"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
'@
$conteudo = Substituir $conteudo $buscaDialog $novoDialog "Dialog do CP-SAT"

Set-Content -Path $caminho -Value $conteudo -Encoding UTF8 -NoNewline
Write-Host "Pronto! Botao 'Gerar com CP-SAT (Beta)' adicionado na aba Experimental." -ForegroundColor Green
