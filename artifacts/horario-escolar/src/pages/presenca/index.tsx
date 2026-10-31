// [PRESENCA-PEDAGOGIA] (28/10/2026) Lista de presenca dos professores, marcada aula a aula pela
// pedagogia (P / F / A / S), com substituto e observacao. Feita para o celular: um cartao por
// professor, botoes grandes e o Salvar fixo embaixo. As aulas vem da grade oficial do dia.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCheck, ClipboardCheck, FileDown, FileSpreadsheet, Loader2, MessageSquareText, Save, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBaixarArquivo, montarUrl } from "@/hooks/use-baixar-arquivo";
import {
  STATUS, TURNOS, buscarPresenca, salvarPresenca, excelDoDia, hojeLocal, turnoAgora, mensagemErro,
  type Marca, type MarcaEnvio, type Presenca, type Status,
} from "@/lib/presenca";

const chave = (professorId: number, numeroAula: number) => `${professorId}|${numeroAula}`;
const OUTRO = "outro";

export default function PresencaPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { baixar, baixando } = useBaixarArquivo();
  const [data, setData] = useState(hojeLocal());
  const [turno, setTurno] = useState(turnoAgora());
  const [busca, setBusca] = useState("");
  // alteracoes ainda nao salvas: chave -> marca (null = desmarcar)
  const [pendentes, setPendentes] = useState<Map<string, Marca | null>>(new Map());
  const [obsAberta, setObsAberta] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const q = useQuery({
    queryKey: ["presenca", data, turno],
    queryFn: () => buscarPresenca(data, turno),
    enabled: !!data,
    retry: false,
  });
  const p: Presenca | undefined = q.data;

  useEffect(() => { setPendentes(new Map()); setObsAberta(new Set()); }, [data, turno]);
  // aviso ao sair com alteracao sem salvar
  useEffect(() => {
    if (!pendentes.size) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [pendentes.size]);

  const marcaAtual = (professorId: number, numeroAula: number, salva: Marca | null): Marca | null => {
    const k = chave(professorId, numeroAula);
    return pendentes.has(k) ? pendentes.get(k)! : salva;
  };
  const mudar = (professorId: number, numeroAula: number, nova: Marca | null) => {
    setPendentes((m) => new Map(m).set(chave(professorId, numeroAula), nova));
  };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!p) return [];
    if (!t) return p.professores;
    return p.professores.filter((x) => x.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t));
  }, [p, busca]);

  const contagem = useMemo(() => {
    const c = { total: 0, marcadas: 0, falta: 0, atraso: 0, substituido: 0 };
    for (const prof of p?.professores ?? []) for (const a of prof.aulas) {
      c.total++;
      const m = marcaAtual(prof.professorId, a.numeroAula, a.marca);
      if (m) { c.marcadas++; if (m.status === "falta") c.falta++; if (m.status === "atraso") c.atraso++; if (m.status === "substituido") c.substituido++; }
    }
    return c;
  }, [p, pendentes]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcarRestantesPresente = () => {
    if (!p) return;
    const n = new Map(pendentes);
    for (const prof of p.professores) for (const a of prof.aulas) {
      if (!marcaAtual(prof.professorId, a.numeroAula, a.marca)) n.set(chave(prof.professorId, a.numeroAula), { status: "presente", substitutoId: null, substitutoNome: null, observacao: null });
    }
    setPendentes(n);
  };

  const salvar = async () => {
    if (!pendentes.size) return;
    const marcas: MarcaEnvio[] = [...pendentes.entries()].map(([k, m]) => {
      const [professorId, numeroAula] = k.split("|").map(Number) as [number, number];
      return { professorId, numeroAula, status: m?.status ?? null, substitutoId: m?.substitutoId ?? null, substitutoNome: m?.substitutoNome ?? null, observacao: m?.observacao ?? null };
    });
    setSalvando(true);
    try {
      await salvarPresenca(data, turno, marcas);
      toast({ title: "Presença salva", description: `${marcas.length} aula(s) atualizada(s).` });
      setPendentes(new Map());
      await qc.invalidateQueries({ queryKey: ["presenca", data, turno] });
      qc.invalidateQueries({ queryKey: ["onde-esta"] });
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: mensagemErro(e), variant: "destructive" });
    } finally { setSalvando(false); }
  };

  const fimDeSemana = (() => { const d = new Date(`${data}T12:00:00`).getDay(); return d === 0 || d === 6; })();

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="w-6 h-6" /> Presença dos professores</h1>
        <p className="text-muted-foreground text-sm">Marque cada aula: <b>P</b> presente, <b>F</b> falta, <b>A</b> atraso, <b>S</b> substituído. Toque de novo para desmarcar. No fim, clique em <b>Salvar</b>.</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dia</label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-[10.5rem]" />
            </div>
            <div className="flex rounded-md border overflow-hidden">
              {TURNOS.map((t) => (
                <button key={t.valor} type="button" onClick={() => setTurno(t.valor)}
                  className={cn("px-3 py-2 text-sm font-medium", turno === t.valor ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
                  {t.rotulo}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar professor" className="pl-8" />
            </div>
          </div>
          {p && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{p.diaSemana}, {p.dataBR} · {p.rotuloTurno}:</span>
              <Badge variant="secondary">{contagem.marcadas} de {contagem.total} marcadas</Badge>
              {contagem.falta > 0 && <Badge className="bg-red-600">{contagem.falta} falta(s)</Badge>}
              {contagem.atraso > 0 && <Badge className="bg-amber-500">{contagem.atraso} atraso(s)</Badge>}
              {contagem.substituido > 0 && <Badge className="bg-sky-600">{contagem.substituido} substituída(s)</Badge>}
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={marcarRestantesPresente} disabled={contagem.marcadas === contagem.total}>
                <CheckCheck className="w-4 h-4 mr-1" /> Restantes = Presente
              </Button>
              <Button size="sm" variant="outline" disabled={baixando["pdf-dia"] || pendentes.size > 0}
                title={pendentes.size ? "Salve antes de gerar o relatório" : undefined}
                onClick={() => baixar(montarUrl("/api/pedagogia/presenca/pdf", { data, turno }), `presenca_${data}_${turno}.pdf`, "pdf-dia")}>
                {baixando["pdf-dia"] ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />} PDF
              </Button>
              <Button size="sm" variant="outline" disabled={pendentes.size > 0} onClick={() => p && excelDoDia(p).catch((e) => toast({ title: "Não foi possível gerar a planilha", description: mensagemErro(e), variant: "destructive" }))}
                title={pendentes.size ? "Salve antes de gerar o relatório" : undefined}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {p?.semTabela && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          A lista já mostra as aulas, mas ainda não dá para salvar: falta a atualização do sistema no banco. Avise o suporte NexGrade.
        </div>
      )}
      {p?.aviso && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{p.aviso}</div>
      )}
      {q.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando as aulas do dia...</div>}
      {q.isError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{fimDeSemana ? "Não há aula no fim de semana." : mensagemErro(q.error) ?? "Não foi possível carregar a lista."}</div>}
      {p && !p.professores.length && <p className="text-muted-foreground text-sm">Nenhuma aula na grade neste turno.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtrados.map((prof) => (
          <Card key={prof.professorId} className="overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center gap-2">
              <span className="font-semibold text-sm flex-1">{prof.nome}</span>
              {prof.licenca && <Badge variant="outline" className="border-amber-400 text-amber-800">{prof.licenca}</Badge>}
            </div>
            <div className="divide-y">
              {prof.aulas.map((a) => {
                const k = chave(prof.professorId, a.numeroAula);
                const m = marcaAtual(prof.professorId, a.numeroAula, a.marca);
                const alterada = pendentes.has(k);
                const obs = obsAberta.has(k) || !!m?.observacao;
                return (
                  <div key={a.numeroAula} className={cn("px-4 py-3 space-y-2", alterada && "bg-primary/5")}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.numeroAula}ª aula{a.hora && <span className="text-muted-foreground font-normal"><span className="hidden sm:inline"> · </span><br className="sm:hidden" />{a.hora}–{a.fim}</span>}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.turmas}{a.disciplinas && ` · ${a.disciplinas}`}{a.sala && ` · ${a.sala}`}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {STATUS.map((s) => (
                          <button key={s.valor} type="button" title={s.rotulo} aria-label={s.rotulo} aria-pressed={m?.status === s.valor}
                            onClick={() => mudar(prof.professorId, a.numeroAula, m?.status === s.valor ? null : { status: s.valor, substitutoId: s.valor === "substituido" ? m?.substitutoId ?? null : null, substitutoNome: s.valor === "substituido" ? m?.substitutoNome ?? null : null, observacao: m?.observacao ?? null })}
                            className={cn("w-10 h-10 rounded-md border-2 text-sm font-bold transition-colors", m?.status === s.valor ? s.corAtiva : cn("bg-background", s.cor))}>
                            {s.curto}
                          </button>
                        ))}
                        <button type="button" title="Observação" aria-label="Observação"
                          onClick={() => setObsAberta((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                          className={cn("w-10 h-10 rounded-md border flex items-center justify-center text-muted-foreground", obs && "text-primary border-primary/40")}>
                          <MessageSquareText className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {m?.status === "substituido" && (
                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={m.substitutoId != null ? String(m.substitutoId) : m.substitutoNome != null ? OUTRO : ""}
                          onValueChange={(v) => mudar(prof.professorId, a.numeroAula, { ...m, substitutoId: v && v !== OUTRO ? Number(v) : null, substitutoNome: v === OUTRO ? (m.substitutoNome ?? "") : null })}>
                          <SelectTrigger className="h-9 w-64 max-w-full"><SelectValue placeholder="Quem deu a aula?" /></SelectTrigger>
                          <SelectContent>
                            {p!.substitutos.filter((s) => s.id !== prof.professorId).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>)}
                            <SelectItem value={OUTRO}>Outra pessoa (digitar o nome)</SelectItem>
                          </SelectContent>
                        </Select>
                        {m.substitutoId == null && m.substitutoNome != null && (
                          <Input className="h-9 w-56 max-w-full" placeholder="Nome de quem substituiu" value={m.substitutoNome}
                            onChange={(e) => mudar(prof.professorId, a.numeroAula, { ...m, substitutoNome: e.target.value })} />
                        )}
                      </div>
                    )}
                    {obs && (
                      <Input className="h-9" placeholder={m ? "Observação (ex.: atestado, saiu mais cedo)" : "Marque P, F, A ou S para anotar a observação"} disabled={!m}
                        value={m?.observacao ?? ""} onChange={(e) => m && mudar(prof.professorId, a.numeroAula, { ...m, observacao: e.target.value })} />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {pendentes.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 md:left-64 z-40 border-t bg-card/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <span className="text-sm flex-1">{pendentes.size} alteração(ões) sem salvar</span>
          <Button variant="ghost" onClick={() => setPendentes(new Map())} disabled={salvando}>Descartar</Button>
          <Button onClick={salvar} disabled={salvando || p?.semTabela}>
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
          </Button>
        </div>
      )}
    </div>
  );
}
