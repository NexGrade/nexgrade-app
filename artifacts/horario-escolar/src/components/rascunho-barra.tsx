// [MODO-RASCUNHO] (06/11/2026) Faixa do rascunho no topo das telas: comecar, abrir, ver mudancas, desligar e descartar.
// [SO-PROMOVER] (09/11/2026) pedido da dona: sem "Aplicar na escola" na faixa; o rascunho vale pela escola so pelo
// "Promover para oficial" do Modo Experimental (que confere os choques antes). So para quem edita a grade (direcao/coordenacao/secretaria).
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, useListTurmas } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirmar } from "@/components/confirmar"; // [CONFIRMAR-NEXGRADE]
import { usePapelEfetivo } from "@/lib/papeis";
import { useRascunho, ligarRascunho } from "@/lib/rascunho";
import { FileEdit, ListChecks, Loader2, RotateCcw, ShieldCheck } from "lucide-react";

export const PAGINAS_DO_RASCUNHO = ["/horario", "/disponibilidade", "/turmas"];
export const naPaginaDoRascunho = (local: string) => PAGINAS_DO_RASCUNHO.some((p) => local.startsWith(p));

// [RASCUNHO-VISUAL] (27/11/2026) pedido da dona: as vezes nao dava para saber se estava no rascunho ou na grade real.
// Moldura roxa na area da tela e selo "Rascunho" no menu, so para quem edita a grade e so nas telas que o rascunho muda.
export function useRascunhoNaTela() {
  const papel = usePapelEfetivo();
  const [local] = useLocation();
  const { rascunho, ligado } = useRascunho();
  const podeEditar = !papel.carregando && !papel.ehProfessor && !papel.ehGestor && !papel.ehPedagogia;
  return { ligado: podeEditar && ligado, naPagina: naPaginaDoRascunho(local), nome: rascunho?.nome ?? null };
}
export const PROMOVER_TEXTO = 'o "Promover para oficial" (Gerar Grade → Modo Experimental)'; // [SO-PROMOVER]
type MudancaDisp = { professorId: number; professor: string; turno: string; diaSemana: number; horarioSlot: number; antes: string; depois: string };
type MudancaAtrib = { turmaDisciplinaId: number; turma: string; disciplina: string; professorOficialId: number | null; professorId: number | null; mudou: boolean };
type DifTurma = { turmaId: number; turma: string; mudancas: Array<{ quando: string; antes: string; depois: string }> };
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite", integral: "Integral" };
// [RASCUNHO-ALCANCE] (09/11/2026) o que o rascunho copia da escola
const ALCANCES = [
  { v: "matutino", r: "Só a Manhã" }, { v: "vespertino", r: "Só a Tarde" }, { v: "noturno", r: "Só a Noite" }, { v: "integral", r: "Só o Integral" },
  { v: "turmas", r: "Só as turmas que eu escolher" }, { v: "todos", r: "A escola toda (todos os turnos)" },
];
export function descreverAlcance(r: { alcance?: string; turmaIds?: number[] }, nomeTurma?: (id: number) => string | undefined): string {
  if (!r.alcance || r.alcance === "todos") return "escola toda";
  if (r.alcance === "turmas") {
    const nomes = (r.turmaIds ?? []).map((id) => nomeTurma?.(id)).filter(Boolean);
    return nomes.length ? `turmas ${nomes.join(", ")}` : `${r.turmaIds?.length ?? 0} turma(s)`;
  }
  return TURNO[r.alcance] ?? r.alcance;
}

export function RascunhoBarra() {
  const papel = usePapelEfetivo();
  const [local, navegar] = useLocation();
  const { rascunho, ligado, recarregar, carregando: carregandoRascunho } = useRascunho();
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirmar = useConfirmar();
  const [novoAberto, setNovoAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [alcance, setAlcance] = useState("matutino"); // [RASCUNHO-ALCANCE]
  const [turmasEscolhidas, setTurmasEscolhidas] = useState<number[]>([]);
  const { data: turmasEscola = [] } = useListTurmas();
  const turmasOrdenadas = [...turmasEscola].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const turnosDaEscola = new Set<string>(turmasEscola.map((t) => t.turno));
  const nomeTurma = (id: number) => turmasEscola.find((t) => t.id === id)?.nome;
  const abrirNovo = () => { setAlcance(["matutino", "vespertino", "noturno", "integral"].find((t) => turnosDaEscola.has(t)) ?? "todos"); setNovoAberto(true); };
  const [ocupado, setOcupado] = useState<string | null>(null);
  // [RASCUNHO-EVIDENTE] convite grande para comecar um rascunho (a pessoa pode ocultar; lembra no navegador)
  const [convite, setConvite] = useState<boolean>(() => { try { return localStorage.getItem("nexgrade.conviteRascunho") !== "0"; } catch { return true; } });
  const mudarConvite = (v: boolean) => { setConvite(v); try { localStorage.setItem("nexgrade.conviteRascunho", v ? "1" : "0"); } catch { /* sem armazenamento */ } };
  const [mudancas, setMudancas] = useState<null | "carregando" | { disp: MudancaDisp[]; atrib: MudancaAtrib[]; aulas: DifTurma[]; profs: Map<number, string> }>(null);

  if (papel.carregando || papel.ehProfessor || papel.ehGestor || papel.ehPedagogia) return null;
  // [SEM-PISCAR] (27/11/2026) enquanto nao se sabe se ha rascunho, nada aparece: antes piscavam o selo "Grade oficial" e o
  // convite "Comecar rascunho" por 1 a 3 s antes da faixa roxa, com o rascunho ligado
  if (carregandoRascunho) return null;
  const naPagina = naPaginaDoRascunho(local);
  const atualizarTudo = async () => { await recarregar(); await qc.invalidateQueries(); };

  const criar = async () => {
    setOcupado("criar");
    try {
      const r = await customFetch<{ nome: string; aulas: number; alcance?: string; turmaIds?: number[] | null }>("/api/horarios/rascunho/atual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), alcance, ...(alcance === "turmas" ? { turmaIds: turmasEscolhidas } : {}) }),
      });
      ligarRascunho(r.nome);
      setNovoAberto(false); setNome(""); setTurmasEscolhidas([]);
      await atualizarTudo();
      // [RASCUNHO-EM-BRANCO] (17/11/2026) o rascunho abre em branco: a grade vem do Gerar ou do Melhorar
      toast({ title: `Rascunho "${r.nome}" criado (${descreverAlcance({ alcance: r.alcance, turmaIds: r.turmaIds ?? undefined }, nomeTurma)})`, description: `Ele começa em branco. Gere a grade em Gerar Grade (do zero ou "Melhorar"). Nada vale para a escola até ${PROMOVER_TEXTO}.` });
    } catch (e) {
      toast({ title: "Não foi possível criar o rascunho", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setOcupado(null); }
  };

  const verMudancas = async () => {
    if (!rascunho) return;
    setMudancas("carregando");
    try {
      const n = encodeURIComponent(rascunho.nome);
      const [disp, atrib, dif, profs] = await Promise.all([
        customFetch<{ mudancas: MudancaDisp[] }>(`/api/disponibilidade/experimentos/${n}`).catch(() => ({ mudancas: [] as MudancaDisp[] })),
        customFetch<MudancaAtrib[]>(`/api/horarios/experimentais/${n}/atribuicoes`),
        customFetch<{ turmas: DifTurma[] }>(`/api/horarios/experimentais/${n}/diferencas`),
        customFetch<Array<{ id: number; nome: string }>>("/api/professores"),
      ]);
      setMudancas({ disp: disp.mudancas, atrib: atrib.filter((a) => a.mudou), aulas: dif.turmas, profs: new Map(profs.map((p) => [p.id, p.nome])) });
    } catch (e) {
      setMudancas(null);
      toast({ title: "Não foi possível carregar as mudanças", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const desfazer = async (fn: () => Promise<unknown>) => {
    try { await fn(); await verMudancas(); await atualizarTudo(); }
    catch (e) { toast({ title: "Não foi possível desfazer", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
  };

  const descartar = async () => {
    if (!rascunho || !(await confirmar({ titulo: `Descartar o rascunho "${rascunho.nome}"?`, texto: "Tudo o que foi mudado nele é apagado. A escola continua como está.", confirmar: "Descartar", perigo: true }))) return;
    setOcupado("descartar");
    try {
      await customFetch("/api/horarios/rascunho/atual", { method: "DELETE" });
      ligarRascunho(null);
      await atualizarTudo();
      toast({ title: "Rascunho descartado" });
    } catch (e) {
      toast({ title: "Não foi possível descartar", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setOcupado(null); }
  };

  const nm = mudancas && mudancas !== "carregando" ? mudancas : null;
  return (
    <>
      {/* [RASCUNHO-EVIDENTE] (06/11/2026) pedido da dona: rascunho bem visivel. Dentro dele: faixa roxa cheia, presa no topo */}
      {/* [RASCUNHO-VISUAL] fora de Grade, Disponibilidade e Turmas a tela mostra a escola como esta: faixa curta que diz isso */}
      {ligado && rascunho && !naPagina && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-2 border-violet-300 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
            <FileEdit className="w-3.5 h-3.5" />Rascunho ligado
          </span>
          <span className="flex-1 min-w-[14rem]">
            Você está no rascunho <strong>{rascunho.nome}</strong>, mas <strong>esta tela mostra a escola como está</strong>. O rascunho só aparece em Gerar Grade, Disponibilidade e Turmas.
          </span>
          <Button size="sm" className="h-8 bg-violet-700 text-white hover:bg-violet-800" onClick={() => navegar("/horario")}>Ver a grade do rascunho</Button>
          <Button size="sm" variant="ghost" className="h-8 text-violet-800 hover:bg-violet-100" onClick={() => ligarRascunho(null)}>Sair do rascunho</Button>
        </div>
      )}
      {ligado && rascunho && naPagina && (
        <div className="sticky top-0 z-30 -mt-1 mb-4 rounded-lg bg-violet-700 px-4 py-3 text-white shadow-md ring-2 ring-violet-300">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
              <FileEdit className="w-3.5 h-3.5" />Modo rascunho
            </span>
            <span className="flex-1 min-w-[14rem] text-sm">
              <strong className="text-base">{rascunho.nome}</strong>
              <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">{descreverAlcance(rascunho, nomeTurma)}</span>
              <span className="block text-violet-100">Nada vale para a escola até promover, em Gerar Grade → Modo Experimental.</span>{/* [FAIXA-LIMPA] (27/11/2026) texto curto, pedido da dona */}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {/* [FAIXA-LIMPA] "Ver mudancas" continua (lista com desfazer), mas discreto como os outros botoes da faixa */}
              <Button size="sm" variant="ghost" className="h-9 text-white/90 hover:bg-white/15 hover:text-white" onClick={() => void verMudancas()} title="Lista do que mudou no rascunho (professores, disponibilidade e aulas), com desfazer">
                <ListChecks className="w-4 h-4 mr-1.5" />Ver mudanças
              </Button>
              {/* [PROMOVER-SO-NO-EXPERIMENTAL] (27/11/2026) pedido da dona: sem o atalho "Promover para oficial…" na faixa;
                  promover so no cartao do rascunho em Gerar Grade → Modo Experimental (que confere os choques) */}
              <Button size="sm" variant="ghost" className="h-9 text-white hover:bg-white/15 hover:text-white" onClick={() => ligarRascunho(null)} title="Volta a mostrar a escola como está (o rascunho continua guardado)">Sair do rascunho</Button>
              <Button size="sm" variant="ghost" className="h-9 text-rose-100 hover:bg-white/15 hover:text-white" disabled={ocupado !== null} onClick={() => void descartar()}>Descartar</Button>
            </div>
          </div>
        </div>
      )}
      {/* [RASCUNHO-VISUAL] fora do rascunho, nas telas que ele muda: selo verde dizendo que e a grade que vale na escola */}
      {!ligado && naPagina && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
            <ShieldCheck className="w-3.5 h-3.5" />Grade oficial
          </span>
          <span>Você está vendo a escola como está, fora do rascunho: é o que vale hoje para professores e turmas.</span>
        </div>
      )}
      {!ligado && rascunho && naPagina && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-2 border-violet-300 bg-violet-50 px-4 py-3 text-violet-900">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-700 text-white"><FileEdit className="w-4 h-4" /></span>
          <span className="flex-1 min-w-[14rem] text-sm">
            <strong className="block text-base">Existe o rascunho “{rascunho.nome}”</strong>
            {rascunho.criadoPor ? `Começado por ${rascunho.criadoPor}.` : "Ele fica guardado até você entrar de novo."}{/* [RASCUNHO-VISUAL] o selo verde acima ja diz que e a escola como esta */}
          </span>
          <Button className="h-9 bg-violet-700 text-white hover:bg-violet-800" onClick={() => ligarRascunho(rascunho.nome)}>
            <FileEdit className="w-4 h-4 mr-1.5" />Entrar no rascunho
          </Button>
        </div>
      )}
      {!rascunho && naPagina && (convite ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/70 px-4 py-3 text-violet-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-700 text-white"><FileEdit className="w-5 h-5" /></span>
          <span className="flex-1 min-w-[14rem] text-sm">
            <strong className="block text-base">Quer testar uma mudança sem mexer na escola?</strong>
            Comece um rascunho: troque professores, aulas e disponibilidade, veja como fica e só depois aplique.
          </span>
          <Button className="h-10 bg-violet-700 px-5 text-white hover:bg-violet-800" onClick={abrirNovo}>
            <FileEdit className="w-4 h-4 mr-1.5" />Começar rascunho
          </Button>
          <button type="button" className="text-xs text-violet-700 underline" onClick={() => mudarConvite(false)} title="Mostrar só um botão pequeno">ocultar</button>
        </div>
      ) : (
        <div className="mb-4 flex justify-end">
          <Button size="sm" className="h-8 bg-violet-700 text-white hover:bg-violet-800" onClick={abrirNovo} title="Testar mudanças de grade, disponibilidade e professores sem mexer na escola">
            <FileEdit className="w-4 h-4 mr-1" />Começar rascunho
          </Button>
          <button type="button" className="ml-2 text-xs text-violet-700 underline" onClick={() => mudarConvite(true)}>o que é?</button>
        </div>
      ))}

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Começar rascunho</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {/* [RASCUNHO-EM-BRANCO] */}
              O rascunho começa <strong>em branco</strong> (só do turno ou das turmas que você escolher). Mude a Disponibilidade e o professor das disciplinas em Turmas
              e gere a grade em Gerar Grade: do zero ou com "Melhorar", que parte da grade de hoje. Depois troque aulas na Grade se quiser. <strong>Nada vale para a escola até {PROMOVER_TEXTO}.</strong>
            </p>
            <div className="space-y-1.5">
              <Label>O que entra no rascunho</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={alcance} onChange={(e) => setAlcance(e.target.value)}>
                {ALCANCES.filter((a) => a.v === "todos" || a.v === "turmas" || turnosDaEscola.has(a.v)).map((a) => <option key={a.v} value={a.v}>{a.r}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Só essa parte da grade é gerada e aplicada. O resto da escola não muda.</p>
              {alcance === "turmas" && (
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                  {turmasOrdenadas.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <input type="checkbox" className="h-3.5 w-3.5" checked={turmasEscolhidas.includes(t.id)}
                        onChange={(e) => setTurmasEscolhidas((xs) => e.target.checked ? [...xs, t.id] : xs.filter((x) => x !== t.id))} />
                      {t.nome} <span className="text-xs text-muted-foreground">{TURNO[t.turno] ?? t.turno}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Nome do rascunho</Label>
              <Input autoFocus value={nome} maxLength={80} placeholder="Ex.: Ana sem sexta-feira" onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nome.trim()) void criar(); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovoAberto(false)}>Cancelar</Button>
            <Button disabled={!nome.trim() || ocupado !== null || (alcance === "turmas" && !turmasEscolhidas.length)} onClick={() => void criar()}>{ocupado === "criar" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Começar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mudancas !== null} onOpenChange={(v) => { if (!v) setMudancas(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mudanças do rascunho {rascunho ? `"${rascunho.nome}"` : ""}</DialogTitle></DialogHeader>
          {mudancas === "carregando" && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>}
          {nm && rascunho && (
            <div className="space-y-5 text-sm">
              {!nm.disp.length && !nm.atrib.length && !nm.aulas.length && <p className="text-muted-foreground">Nenhuma mudança ainda: o rascunho está igual à escola.</p>}
              {nm.atrib.length > 0 && (
                <section className="space-y-1">
                  <h3 className="font-semibold">Professores das disciplinas ({nm.atrib.length})</h3>
                  {nm.atrib.map((a) => (
                    <div key={a.turmaDisciplinaId} className="flex items-center gap-2">
                      <span className="flex-1">{a.turma} · {a.disciplina}: <span className="text-muted-foreground line-through">{a.professorOficialId != null ? nm.profs.get(a.professorOficialId) ?? "?" : "sem professor"}</span> → <strong>{a.professorId != null ? nm.profs.get(a.professorId) ?? "?" : "sem professor"}</strong></span>
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        onClick={() => void desfazer(() => customFetch(`/api/horarios/experimentais/${encodeURIComponent(rascunho.nome)}/atribuicoes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turmaDisciplinaId: a.turmaDisciplinaId, professorId: a.professorOficialId, confirmar: true }) }))}>
                        <RotateCcw className="w-3 h-3" />desfazer
                      </button>
                    </div>
                  ))}
                </section>
              )}
              {nm.disp.length > 0 && (
                <section className="space-y-1">
                  <h3 className="font-semibold">Disponibilidade ({nm.disp.length})</h3>
                  {[...new Set(nm.disp.map((d) => d.professorId))].map((pid) => {
                    const doProf = nm.disp.filter((d) => d.professorId === pid);
                    return (
                      <div key={pid} className="flex items-start gap-2">
                        <span className="flex-1"><strong>{doProf[0]!.professor}</strong>: {doProf.map((d) => `${TURNO[d.turno] ?? d.turno} ${DIA[d.diaSemana]} ${d.horarioSlot}ª ${d.antes} → ${d.depois}`).join("; ")}</span>
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
                          onClick={() => void desfazer(() => customFetch(`/api/disponibilidade/experimentos/${encodeURIComponent(rascunho.nome)}/professores/${pid}`, { method: "DELETE" }))}>
                          <RotateCcw className="w-3 h-3" />desfazer
                        </button>
                      </div>
                    );
                  })}
                </section>
              )}
              {nm.aulas.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-semibold">Aulas ({nm.aulas.reduce((s, t) => s + t.mudancas.length, 0)} horário(s) em {nm.aulas.length} turma(s))</h3>
                  {nm.aulas.map((t) => (
                    <div key={t.turmaId}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium flex-1">{t.turma}</span>
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          onClick={() => void desfazer(() => customFetch(`/api/horarios/experimentais/${encodeURIComponent(rascunho.nome)}/restaurar-turma`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turmaId: t.turmaId }) }))}>
                          <RotateCcw className="w-3 h-3" />voltar como está na escola
                        </button>
                      </div>
                      <ul className="ml-3 text-xs text-muted-foreground space-y-0.5">
                        {t.mudancas.map((m, i) => <li key={i}>{m.quando}: {m.antes} → <span className="text-foreground">{m.depois}</span></li>)}
                      </ul>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
