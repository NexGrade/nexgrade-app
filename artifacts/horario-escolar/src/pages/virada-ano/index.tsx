import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CalendarClock, CheckCircle2, Copy, Download, Loader2, Lock, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// [VIRADA-ANO] (24/10/2026) Virada do ano letivo (plano: claude/plano-virada-ano-letivo.md).
// As turmas continuam (sao a "vaga" na grade) e passam para o ano novo; a escola so ajusta o que mudou:
// fecha turma, abre mais uma da mesma serie (duplicar) e desmarca o professor que saiu. Zeram grade
// oficial, experimentos, disponibilidade (bloqueios e HA) e codigos SERE. Tudo vai para o backup e da
// para desfazer enquanto nao houver grade oficial do ano novo.

type Situacao = {
  anoDe: number; anoPara: number; hoje: string; fimDoAno: string | null; liberada: boolean; liberadaPeloMaster: boolean;
  confirmacao: string;
  ultimaVirada: { id: number; anoDe: number; anoPara: number; feitaEm: string; feitaPor: string | null; resumo: Resumo | null } | null;
  podeDesfazer: boolean; motivoNaoDesfaz: string | null;
};
type Resumo = { anoDe: number; anoPara: number; turmasContinuam: number; turmasExcluidas: number; turmasCriadas: number; professoresQueSairam: number; aulasApagadas: number; experimentosApagados: number; disponibilidadeApagada: number };
type Previa = {
  situacao: Situacao;
  turmas: Array<{ id: number; nome: string; serie: string; turno: string; anoLetivo: number; disciplinas: number; semProfessor: number }>;
  professores: Array<{ id: number; nome: string; ativo: boolean; aulas: number }>;
  zera: { aulasOficiais: number; experimentos: number; disponibilidade: number; codigosSere: number };
};

const NOME_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
// 6E -> 6F; 1C TEC -> 1D TEC; se nao der, "6E (2)"
function sugerirNome(nome: string, usados: Set<string>): string {
  const m = nome.match(/^(\d+\s*[ºª°]?\s*)([A-Y])(\b.*)$/i);
  for (let i = 1; m && i < 26; i++) {
    const letra = String.fromCharCode(m[2]!.toUpperCase().charCodeAt(0) + i);
    if (letra > "Z") break;
    const s = `${m[1]}${letra}${m[3]}`;
    if (!usados.has(s.trim().toUpperCase())) return s;
  }
  for (let i = 2; ; i++) { const s = `${nome} (${i})`; if (!usados.has(s.toUpperCase())) return s; }
}

async function baixar(url: string, nome: string) {
  const blob = await customFetch<Blob>(url, { responseType: "blob" });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export default function ViradaAnoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: previa, isLoading, isError, error } = useQuery({
    queryKey: ["virada-ano-previa"],
    queryFn: () => customFetch<Previa>("/api/virada-ano/previa", { responseType: "json" }),
  });
  const [excluir, setExcluir] = useState<Set<number>>(new Set());
  const [duplicar, setDuplicar] = useState<Array<{ chave: number; origemId: number; nome: string }>>([]);
  const [saem, setSaem] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resumo | null>(null);

  const s = previa?.situacao;
  const turmasPorTurno = useMemo(() => {
    const m = new Map<string, Previa["turmas"]>();
    for (const t of previa?.turmas ?? []) m.set(t.turno, [...(m.get(t.turno) ?? []), t]);
    return [...m.entries()];
  }, [previa]);
  const ativos = (previa?.professores ?? []).filter((p) => p.ativo);
  const profsVisiveis = ativos.filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const usados = useMemo(() => new Set([
    ...(previa?.turmas ?? []).filter((t) => !excluir.has(t.id)).map((t) => t.nome.trim().toUpperCase()),
    ...duplicar.map((d) => d.nome.trim().toUpperCase()),
  ]), [previa, excluir, duplicar]);

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["virada-ano-previa"] });

  async function virar() {
    if (!s) return;
    setEnviando(true);
    try {
      const r = await customFetch<{ ok: boolean; resumo: Resumo }>("/api/virada-ano", {
        method: "POST", headers: { "Content-Type": "application/json" }, responseType: "json",
        body: JSON.stringify({ excluirTurmas: [...excluir], duplicarTurmas: duplicar.map(({ origemId, nome }) => ({ origemId, nome })), professoresQueSaem: [...saem], confirmacao }),
      });
      setResultado(r.resumo);
      setExcluir(new Set()); setDuplicar([]); setSaem(new Set()); setConfirmacao("");
      toast({ title: `Pronto: a escola virou para ${r.resumo.anoPara}`, description: "O backup de " + r.resumo.anoDe + " ficou guardado. Dá para desfazer enquanto não houver grade oficial nova." });
      queryClient.invalidateQueries();
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: "A virada não foi feita", description: e?.data?.error ?? e?.message ?? "Tente de novo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function desfazer() {
    if (!s?.ultimaVirada) return;
    if (!window.confirm(`Desfazer a virada para ${s.ultimaVirada.anoPara}?\n\nTudo volta como estava em ${s.ultimaVirada.anoDe}: turmas, professores, grade oficial, experimentos e disponibilidade. Turmas criadas depois da virada serão excluídas.`)) return;
    setEnviando(true);
    try {
      await customFetch("/api/virada-ano/desfazer", { method: "POST", responseType: "json" });
      setResultado(null);
      toast({ title: "Virada desfeita", description: `A escola voltou para ${s.ultimaVirada.anoDe}.` });
      queryClient.invalidateQueries();
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: "Não foi possível desfazer", description: e?.data?.error ?? e?.message ?? "Tente de novo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function baixarPdf(visao: "turma" | "professor") {
    setBaixando(visao);
    try { await baixar(`/api/export/grade-pdf/${visao}`, `grade_${s?.anoDe ?? ""}_por_${visao}.pdf`); }
    catch { toast({ title: "Não foi possível gerar o PDF", variant: "destructive" }); }
    finally { setBaixando(null); }
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !previa || !s) {
    const msg = (error as { data?: { error?: string } } | null)?.data?.error;
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{msg ?? "Não foi possível carregar a virada do ano letivo."}</CardContent></Card>;
  }

  const confirmacaoOk = confirmacao.trim().toUpperCase() === s.confirmacao;
  // depois de virar, as etapas so voltam no ano seguinte (a virada mais recente e para o ano em que as turmas estao)
  const podeVirar = !s.ultimaVirada;
  const resumoMostrado = resultado ?? (s.ultimaVirada?.resumo ?? null);

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-3xl font-bold tracking-tight"><CalendarClock className="h-7 w-7 text-primary" /> Virada do ano letivo</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Prepara a escola para o ano novo sem refazer o cadastro. As turmas continuam (com as disciplinas, cargas e professores) e passam para o ano seguinte;
          você só ajusta o que mudou. A grade oficial, os experimentos, a disponibilidade (bloqueios e HA) e os códigos SERE são zerados. Tudo fica guardado e dá para desfazer.
        </p>
      </div>

      {/* situacao */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="space-y-1 text-sm">
            <p><span className="font-semibold">Turmas em {s.anoDe}</span> · virada para <span className="font-semibold">{s.anoPara}</span></p>
            {s.liberada
              ? <p className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Liberada{s.liberadaPeloMaster ? " pela Nexus Core" : ` (o ano letivo terminou em ${dataBR(s.fimDoAno) || `31/12/${s.anoDe}`})`}.</p>
              : <p className="flex items-center gap-1.5 text-amber-700"><Lock className="h-4 w-4" /> Liberada a partir de {dataBR(s.fimDoAno) || `31/12/${s.anoDe}`} (fim do ano letivo). Até lá dá para conferir e planejar.</p>}
          </div>
          {s.ultimaVirada && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">Virou de {s.ultimaVirada.anoDe} para {s.ultimaVirada.anoPara} em {new Date(s.ultimaVirada.feitaEm).toLocaleDateString("pt-BR")}{s.ultimaVirada.feitaPor ? ` · ${s.ultimaVirada.feitaPor}` : ""}</Badge>
              {s.podeDesfazer
                ? <Button variant="outline" size="sm" onClick={desfazer} disabled={enviando}><Undo2 className="mr-1.5 h-4 w-4" /> Desfazer virada</Button>
                : s.motivoNaoDesfaz && <span className="text-xs text-muted-foreground">{s.motivoNaoDesfaz}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* depois da virada: checklist */}
      {resumoMostrado && s.ultimaVirada && s.anoDe === resumoMostrado.anoPara && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <CardTitle className="text-lg">A escola está em {resumoMostrado.anoPara}. Falta montar a grade:</CardTitle>
            <CardDescription>
              {resumoMostrado.turmasContinuam} turmas continuaram, {resumoMostrado.turmasCriadas} criadas, {resumoMostrado.turmasExcluidas} excluídas; {resumoMostrado.professoresQueSairam} professores saíram.
              Foram para o backup: {resumoMostrado.aulasApagadas} aulas, {resumoMostrado.disponibilidadeApagada} linhas de disponibilidade e {resumoMostrado.experimentosApagados} de experimentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              <li><Link href="/calendario" className="font-medium text-primary hover:underline">Calendário e Turnos</Link>: calendário letivo de {resumoMostrado.anoPara} e horário das aulas.</li>
              <li><Link href="/professores" className="font-medium text-primary hover:underline">Professores</Link>: cadastrar quem chegou.</li>
              <li><Link href="/turmas?filtro=sem-professor" className="font-medium text-primary hover:underline">Turmas sem professor</Link>: escolher o professor das disciplinas que ficaram vazias.</li>
              <li><Link href="/disponibilidade" className="font-medium text-primary hover:underline">Disponibilidade</Link>: lançar os bloqueios de {resumoMostrado.anoPara}.</li>
              <li><Link href="/codigos-rco" className="font-medium text-primary hover:underline">Códigos do RCO</Link>: códigos SERE das turmas de {resumoMostrado.anoPara}.</li>
              <li><Link href="/horario" className="font-medium text-primary hover:underline">Horário → Modo Experimental</Link>: gerar o turno inteiro, conferir e promover.</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {podeVirar && (
        <>
          {/* 1. guardar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Guardar a grade de {s.anoDe}</CardTitle>
              <CardDescription>O sistema guarda tudo automaticamente, mas vale baixar os PDFs para o arquivo da escola antes de virar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => baixarPdf("turma")} disabled={!!baixando}>{baixando === "turma" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Grade por turma (PDF)</Button>
              <Button variant="outline" onClick={() => baixarPdf("professor")} disabled={!!baixando}>{baixando === "professor" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Grade por professor (PDF)</Button>
            </CardContent>
          </Card>

          {/* 2. turmas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Turmas de {s.anoPara}</CardTitle>
              <CardDescription>Todas continuam como estão (mesma série, turno, disciplinas e professores). Marque as que fecham e duplique para abrir mais uma da mesma série.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {turmasPorTurno.map(([turno, turmas]) => (
                <div key={turno}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{NOME_TURNO[turno] ?? turno}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {turmas.map((t) => {
                      const fecha = excluir.has(t.id);
                      return (
                        <div key={t.id} className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm ${fecha ? "bg-red-50 text-muted-foreground line-through" : ""}`}>
                          <div className="min-w-0">
                            <span className="font-semibold">{t.nome}</span> <span className="text-xs text-muted-foreground">{t.serie} · {t.disciplinas} disc.{t.semProfessor ? ` · ${t.semProfessor} sem prof.` : ""}</span>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {!fecha && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Duplicar (abrir mais uma turma desta série)"
                                onClick={() => setDuplicar((l) => [...l, { chave: Date.now() + Math.random(), origemId: t.id, nome: sugerirNome(t.nome, usados) }])}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={fecha ? "Manter a turma" : "Fecha em " + s.anoPara}
                              onClick={() => { setExcluir((x) => { const n = new Set(x); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); setDuplicar((l) => l.filter((d) => d.origemId !== t.id)); }}>
                              {fecha ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {duplicar.length > 0 && (
                <div className="rounded-md border border-dashed p-3">
                  <p className="mb-2 text-sm font-semibold">Turmas novas (cópia da série, sem professor)</p>
                  <div className="space-y-1.5">
                    {duplicar.map((d) => {
                      const origem = previa.turmas.find((t) => t.id === d.origemId);
                      return (
                        <div key={d.chave} className="flex items-center gap-2 text-sm">
                          <Input className="h-8 w-28" value={d.nome} maxLength={30} onChange={(e) => setDuplicar((l) => l.map((x) => (x.chave === d.chave ? { ...x, nome: e.target.value } : x)))} />
                          <span className="text-xs text-muted-foreground">cópia da {origem?.nome} · {origem?.serie} · {NOME_TURNO[origem?.turno ?? ""] ?? origem?.turno}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDuplicar((l) => l.filter((x) => x.chave !== d.chave))}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. professores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Professores em {s.anoPara}</CardTitle>
              <CardDescription>Todos continuam. Desmarque quem saiu: fica inativo (não é excluído) e sai das disciplinas, que ficam para escolher outro professor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Buscar professor" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 max-w-xs" />
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {profsVisiveis.map((p) => {
                  const continua = !saem.has(p.id);
                  return (
                    <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted ${continua ? "" : "text-muted-foreground line-through"}`}>
                      <Checkbox checked={continua} onCheckedChange={(v) => setSaem((x) => { const n = new Set(x); if (v) n.delete(p.id); else n.add(p.id); return n; })} />
                      <span className="truncate">{p.nome}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.aulas} aulas</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{ativos.length - saem.size} continuam · {saem.size} saem</p>
            </CardContent>
          </Card>

          {/* 4. confirmar */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg">4. Virar para {s.anoPara}</CardTitle>
              <CardDescription>Confira o que vai acontecer:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="list-disc space-y-1 pl-5">
                <li>{previa.turmas.length - excluir.size} turmas continuam{excluir.size ? `, ${excluir.size} fecham` : ""}{duplicar.length ? `, ${duplicar.length} novas` : ""}; todas passam para {s.anoPara}.</li>
                <li>{saem.size ? `${saem.size} professores saem (ficam inativos).` : "Todos os professores continuam."}</li>
                <li>Saem da grade e vão para o backup: {previa.zera.aulasOficiais} aulas da grade oficial, {previa.zera.disponibilidade} linhas de disponibilidade (bloqueios e HA){previa.zera.experimentos ? `, ${previa.zera.experimentos} de experimentos` : ""}{previa.zera.codigosSere ? ` e ${previa.zera.codigosSere} códigos SERE` : ""}.</li>
                <li>As reservas já feitas continuam.</li>
              </ul>
              {!s.liberada && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-4 w-4" /> A virada só fica liberada em {dataBR(s.fimDoAno) || `31/12/${s.anoDe}`}.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Input className="h-9 w-40 uppercase" placeholder={s.confirmacao} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} disabled={!s.liberada} />
                <Button onClick={virar} disabled={!s.liberada || !confirmacaoOk || enviando}>
                  {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />} Virar para {s.anoPara}
                </Button>
                <span className="text-xs text-muted-foreground">Digite <strong>{s.confirmacao}</strong> para confirmar.</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <p className="text-xs text-muted-foreground">Precisa recarregar os dados? <button type="button" className="text-primary hover:underline" onClick={recarregar}>Atualizar</button></p>
    </div>
  );
}
