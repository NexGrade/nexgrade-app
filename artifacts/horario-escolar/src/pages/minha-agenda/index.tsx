import { Calendar as CalendarioUI } from "@/components/ui/calendar"; // [CALENDARIO-RESERVA]
import { ptBR as ptBRCalendario } from "react-day-picker/locale"; // [CALENDARIO-RESERVA]
import { format as formatarDataCal } from "date-fns"; // [CALENDARIO-RESERVA]
import { useQuery as useQueryOcupacao } from "@tanstack/react-query"; // [OCUPACAO-SALAS]
import { customFetch as customFetchOcupacao } from "@workspace/api-client-react"; // [OCUPACAO-SALAS]
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserButton, useOrganization } from "@clerk/react";
import { useEu } from "@/lib/papeis"; // [ACESSOS-ESCOLA]
import {
  useGetMinhaAgendaNotificacoes,
  useMarcarMinhaNotificacaoLida,
  getGetMinhaAgendaNotificacoesQueryKey,
} from "@workspace/api-client-react";
import { NotificationBell } from "@/components/notification-bell";
import { CalendarioMesEscola, type ReservaNoCalendario } from "@/components/calendario-mes-escola"; // [CALENDARIO-PROFESSOR]
import { CalendarDays, Download, Loader2, Plus, MonitorSmartphone } from "lucide-react";
import {
  useGetMeuProfessor,
  useGetMinhaAgendaHorario,
  useGetMinhaAgendaReservas,
  useListSalas,
  useListCalendarioEscolar,
  getGetMinhaAgendaReservasQueryKey,
  getGetMinhaAgendaHorarioQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

// [AGENDA-CALENDARIO] (15/10/2026) datas do calendario da escola na agenda do professor:
// proximas datas sempre visiveis (dias seguidos juntos, nomes legiveis) e feriado/recesso
// marcado na grade da semana.
const ROTULO_TIPO: Record<string, string> = {
  feriado: "Feriado",
  recesso: "Recesso",
  ponto_facultativo: "Ponto facultativo",
  estudo_planejamento: "Estudo e planejamento",
  inicio_ano_letivo: "Início do ano letivo",
  fim_ano_letivo: "Fim do ano letivo",
  inicio_trimestre: "Início de trimestre",
  fim_trimestre: "Fim de trimestre",
  reposicao: "Reposição",
};
const COR_TIPO: Record<string, string> = {
  feriado: "#dc2626",
  recesso: "#f59e0b",
  ponto_facultativo: "#ea580c",
  estudo_planejamento: "#7c3aed",
  reposicao: "#0d9488",
};
/** tipos que, sem marcar "dia letivo", significam dia sem aula */
const TIPOS_SEM_AULA = new Set(["feriado", "recesso", "ponto_facultativo", "estudo_planejamento"]);
type EventoCal = { id: number; data: string; tipo: string; descricao: string; diaLetivo?: boolean };
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** datas (AAAA-MM-DD) de segunda a sexta da semana atual; no sabado e domingo, da proxima */
function datasDaSemana(): string[] {
  const d = new Date();
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return isoLocal(x);
  });
}
/** junta dias seguidos com o mesmo tipo e descricao (ex.: recesso de 13 a 22/07) */
function agruparDatas(eventos: EventoCal[]) {
  const grupos: Array<{ inicio: string; fim: string; tipo: string; descricao: string; diaLetivo?: boolean }> = [];
  for (const e of [...eventos].sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo))) {
    const g = grupos.find((x) => x.tipo === e.tipo && x.descricao === e.descricao && (() => {
      const seg = new Date(x.fim + "T12:00:00");
      seg.setDate(seg.getDate() + 1);
      return isoLocal(seg) === e.data;
    })());
    if (g) g.fim = e.data;
    else grupos.push({ inicio: e.data, fim: e.data, tipo: e.tipo, descricao: e.descricao, diaLetivo: e.diaLetivo });
  }
  return grupos.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function diaSemanaDaData(dataISO: string): number {
  // dataISO no formato YYYY-MM-DD. getUTCDay(): 0=domingo..6=sabado.
  // Convertido para 0=segunda..4=sexta (mesma convencao do backend).
  const d = new Date(`${dataISO}T00:00:00Z`);
  const dow = d.getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

function baixarArquivo(conteudo: string, nomeArquivo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// [RESERVA-LOTE] (17/10/2026) Nova reserva: dia, periodo (turno) e as aulas daquele turno com o
// horario; pode escolher varias aulas e varios espacos (cada espaco com as suas aulas) num pedido so.
// So aparecem para escolher as aulas do proprio professor (a reserva e para a aula dele).
const NOME_PERIODO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const ORDEM_PERIODO = ["matutino", "vespertino", "noturno"];
type ItemReserva = { salaId: number; numerosAula: number[] };
type OcupacaoDiaResp = { data: string; maxAula: number; ocupacao: Array<{ salaId: number; numeroAula: number; status: string; turno: string | null }> };

// fora do componente: definido dentro dele, o campo de texto perdia o foco a cada letra
function Passo({ n, titulo: t, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1565C0] text-[11px] text-white">{n}</span>
        {t}
      </h3>
      {children}
    </section>
  );
}

function NovaReservaDialog({ professorId: _professorId }: { professorId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: salas } = useListSalas();
  const { data: minhasReservas } = useGetMinhaAgendaReservas({ query: { queryKey: getGetMinhaAgendaReservasQueryKey() } }); // [RESERVA-NO-CALENDARIO]
  const { data: dadosHorarioApi } = useGetMinhaAgendaHorario({ query: { queryKey: getGetMinhaAgendaHorarioQueryKey() } });
  // a API devolve tambem turno e horarios (fora do tipo gerado)
  const dadosHorario = dadosHorarioApi as unknown as {
    aulas: Array<{ diaSemana: number; numeroAula: number; turno: string; turmaNome: string; disciplinaNome: string }>;
    horarios: Array<{ turno: string; numeroAula: number; horaInicio: string }>;
  } | undefined;

  const [data, setData] = useState("");
  const [turno, setTurno] = useState<string | null>(null);
  const [aulasSel, setAulasSel] = useState<number[]>([]);
  const [salaAtual, setSalaAtual] = useState(0);
  const [itens, setItens] = useState<ItemReserva[]>([]);
  const [titulo, setTitulo] = useState("");
  const [tituloEditado, setTituloEditado] = useState(false); // [RESERVA-LOTE] enquanto nao editar, preenche com turma e disciplina
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);

  const limpar = () => { setData(""); setTurno(null); setAulasSel([]); setSalaAtual(0); setItens([]); setTitulo(""); setTituloEditado(false); setObservacoes(""); };
  const diaSemana = /^\d{4}-\d{2}-\d{2}$/.test(data) ? diaSemanaDaData(data) : -1;

  // aulas do professor no dia escolhido, por turno
  const minhasAulasDoDia = useMemo(
    () => (dadosHorario?.aulas ?? []).filter((a) => a.diaSemana === diaSemana),
    [dadosHorario, diaSemana],
  );
  const turnosDoDia = ORDEM_PERIODO.filter((t) => minhasAulasDoDia.some((a) => a.turno === t));
  // so um periodo com aula no dia: ja escolhe e mostra as aulas
  const unicoTurno = turnosDoDia.length === 1 ? turnosDoDia[0]! : null;
  useEffect(() => { if (data && !turno && unicoTurno) setTurno(unicoTurno); }, [data, turno, unicoTurno]);
  const horariosDoTurno = useMemo(() => {
    if (!turno) return [];
    const nums = new Set<number>([
      ...(dadosHorario?.horarios ?? []).filter((h) => h.turno === turno).map((h) => h.numeroAula),
      ...minhasAulasDoDia.filter((a) => a.turno === turno).map((a) => a.numeroAula),
    ]);
    return [...nums].sort((x, y) => x - y).map((n) => ({
      numeroAula: n,
      hora: (dadosHorario?.horarios ?? []).find((h) => h.turno === turno && h.numeroAula === n)?.horaInicio?.slice(0, 5) ?? "",
      aula: minhasAulasDoDia.find((a) => a.turno === turno && a.numeroAula === n) ?? null,
    }));
  }, [turno, dadosHorario, minhasAulasDoDia]);

  const { data: ocupacao } = useQueryOcupacao({
    queryKey: ["ocupacao-salas", data],
    queryFn: () => customFetchOcupacao<OcupacaoDiaResp>("/api/minha-agenda/ocupacao?data=" + encodeURIComponent(data), { responseType: "json" }),
    enabled: diaSemana >= 0 && diaSemana <= 4,
  });
  const statusSala = (salaId: number, numeroAula: number) =>
    ocupacao?.ocupacao.find((o) => o.salaId === salaId && o.numeroAula === numeroAula && (!o.turno || o.turno === turno))?.status ?? null;

  // [RESERVA-VARIOS-ESPACOS] a mesma aula pode ir para outro espaco (turma dividida);
  // so fica travada a aula que ja esta na lista PARA O ESPACO escolhido agora
  const espacosDaAula = (n: number) => itens.filter((i) => i.numerosAula.includes(n)).map((i) => i.salaId);
  const ocupadasNaSala = salaAtual ? aulasSel.filter((n) => statusSala(salaAtual, n) === "confirmada") : [];
  const podeAdicionar = salaAtual > 0 && aulasSel.length > 0 && ocupadasNaSala.length === 0;
  const nomeSala = (id: number) => salas?.find((s) => s.id === id)?.nome ?? "Espaço";
  const rotuloAula = (n: number) => {
    const h = horariosDoTurno.find((x) => x.numeroAula === n);
    return `${n}ª${h?.hora ? ` (${h.hora})` : ""}`;
  };

  function adicionar() {
    if (!podeAdicionar) return;
    setItens((l) => {
      const ja = l.find((i) => i.salaId === salaAtual);
      if (ja) return l.map((i) => (i.salaId === salaAtual ? { ...i, numerosAula: [...new Set([...i.numerosAula, ...aulasSel])].sort((x, y) => x - y) } : i));
      return [...l, { salaId: salaAtual, numerosAula: [...aulasSel].sort((x, y) => x - y) }];
    });
    setAulasSel([]);
    setSalaAtual(0);
  }

  const itensFinais: ItemReserva[] = podeAdicionar
    ? (() => {
        const ja = itens.find((i) => i.salaId === salaAtual);
        return ja
          ? itens.map((i) => (i.salaId === salaAtual ? { ...i, numerosAula: [...new Set([...i.numerosAula, ...aulasSel])] } : i))
          : [...itens, { salaId: salaAtual, numerosAula: aulasSel }];
      })()
    : itens;
  const totalAulas = itensFinais.reduce((n, i) => n + i.numerosAula.length, 0);
  // turma e disciplina das aulas escolhidas (vem da grade do professor no dia)
  const aulaDe = (n: number) => horariosDoTurno.find((x) => x.numeroAula === n)?.aula ?? null;
  const descreverAulas = (nums: number[]) =>
    [...new Set(nums.map(aulaDe).filter((a): a is NonNullable<typeof a> => !!a).map((a) => `${a.disciplinaNome} · ${a.turmaNome}`))].join("; ");
  const tituloAuto = descreverAulas(itensFinais.flatMap((i) => i.numerosAula));
  useEffect(() => { if (!tituloEditado) setTitulo(tituloAuto); }, [tituloAuto, tituloEditado]);

  async function enviar() {
    if (!turno || !data || totalAulas === 0 || !titulo.trim()) return;
    setEnviando(true);
    try {
      const r = await customFetchOcupacao<{ criadas: number; confirmadas: number; pendentes: number }>("/api/minha-agenda/reservas/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, turno, itens: itensFinais, titulo: titulo.trim(), observacoes: observacoes.trim() || undefined }),
        responseType: "json",
      });
      queryClient.invalidateQueries({ queryKey: getGetMinhaAgendaReservasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-salas"] });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-mes"] });
      toast({
        title: r.pendentes === 0 ? (r.criadas > 1 ? `${r.criadas} reservas confirmadas` : "Reserva confirmada") : r.confirmadas === 0 ? "Solicitação enviada" : `${r.confirmadas} confirmada(s), ${r.pendentes} aguardando`,
        description: r.pendentes > 0 ? "As reservas pendentes entraram na fila de aprovação da coordenação." : "Tudo certo, as reservas já estão na sua agenda.",
      });
      setOpen(false);
      limpar();
    } catch (err: any) {
      toast({ title: "Não foi possível reservar", description: err?.data?.error ?? "Verifique os horários e tente de novo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) limpar(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Nova reserva</span><span className="sm:hidden">Reservar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reservar espaço</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <Passo n={1} titulo="Dia">
            <CalendarioReserva
              diasComReserva={[...new Set((minhasReservas ?? []).map((r) => String(r.data).slice(0, 10)))]}
              salaId={salaAtual}
              value={data}
              onChange={(iso) => { setData(iso); setTurno(null); setAulasSel([]); setItens([]); }}
            />
          </Passo>

          {data && (
            <Passo n={2} titulo="Período">
              {turnosDoDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">Você não tem aula neste dia. A reserva é feita para as suas aulas: escolha outro dia.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ORDEM_PERIODO.map((t) => {
                    const n = minhasAulasDoDia.filter((a) => a.turno === t).length;
                    if (!n) return null;
                    const sel = turno === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setTurno(t); setAulasSel([]); setItens([]); }}
                        className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${sel ? "border-[#1565C0] bg-[#1565C0] text-white" : "hover:bg-muted"}`}
                      >
                        <span className="block font-semibold">{NOME_PERIODO[t] ?? t}</span>
                        <span className={`text-xs ${sel ? "text-white/80" : "text-muted-foreground"}`}>{n} aula{n === 1 ? "" : "s"} sua{n === 1 ? "" : "s"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {turnosDoDia.length > 1 && !turno && <p className="text-xs text-muted-foreground">Toque no período para ver as suas aulas.</p>}
            </Passo>
          )}

          {turno && (
            <Passo n={3} titulo="Aulas (pode marcar mais de uma)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {horariosDoTurno.map(({ numeroAula, hora, aula }) => {
                  const naLista = espacosDaAula(numeroAula);
                  const sel = aulasSel.includes(numeroAula);
                  const st = salaAtual ? statusSala(salaAtual, numeroAula) : null;
                  const desab = !aula || (salaAtual > 0 && naLista.includes(salaAtual));
                  return (
                    <button
                      key={numeroAula}
                      type="button"
                      disabled={desab}
                      onClick={() => setAulasSel((l) => (l.includes(numeroAula) ? l.filter((x) => x !== numeroAula) : [...l, numeroAula]))}
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        desab ? "cursor-not-allowed bg-muted/40 text-muted-foreground/70"
                        : sel ? "border-[#1565C0] bg-[#1565C0]/10 ring-2 ring-[#1565C0]"
                        : "hover:bg-muted"}`}
                    >
                      <span className="flex items-baseline justify-between gap-1">
                        <span className="text-sm font-semibold">{numeroAula}ª aula</span>
                        {hora && <span className="tabular-nums text-muted-foreground">{hora}</span>}
                      </span>
                      {aula ? (
                        <>
                          <span className="block truncate font-medium">{aula.turmaNome}</span>
                          <span className="block truncate text-muted-foreground">{aula.disciplinaNome}</span>
                        </>
                      ) : <span className="block">Sem aula sua</span>}
                      {naLista.length > 0 && (
                        <span className="mt-0.5 block truncate font-medium text-[#1565C0]" title={naLista.map(nomeSala).join(", ")}>
                          Na lista: {naLista.map(nomeSala).join(", ")}
                        </span>
                      )}
                      {sel && st === "confirmada" && <span className="block font-medium text-destructive">Espaço ocupado</span>}
                      {sel && st === "pendente" && <span className="block font-medium text-amber-700">Espaço em análise</span>}
                    </button>
                  );
                })}
              </div>
            </Passo>
          )}

          {turno && (
            <Passo n={4} titulo="Espaço">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={salaAtual ? String(salaAtual) : undefined} onValueChange={(v) => setSalaAtual(Number(v))}>
                  <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Escolha o espaço" /></SelectTrigger>
                  <SelectContent>
                    {salas?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={adicionar} disabled={!podeAdicionar}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar à lista
                </Button>
              </div>
              {salaAtual > 0 && aulasSel.length > 0 && (
                <p className={`text-xs ${ocupadasNaSala.length ? "text-destructive" : "text-muted-foreground"}`}>
                  {ocupadasNaSala.length
                    ? `${nomeSala(salaAtual)} já está reservado na ${ocupadasNaSala.map(rotuloAula).join(", ")} aula. Desmarque essa aula ou escolha outro espaço.`
                    : `${nomeSala(salaAtual)}: ${aulasSel.sort((x, y) => x - y).map((n) => `${rotuloAula(n)} ${statusSala(salaAtual, n) === "pendente" ? "em análise" : "livre"}`).join(" · ")}`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Precisa de outro espaço? Adicione à lista e escolha o próximo, nas mesmas aulas (turma dividida) ou em outras.</p>
            </Passo>
          )}

          {itens.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Na lista</p>
              <ul className="space-y-1">
                {itens.map((i) => (
                  <li key={i.salaId} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <strong>{nomeSala(i.salaId)}</strong> · {i.numerosAula.map(rotuloAula).join(", ")} aula
                      <span className="block text-xs text-muted-foreground">{descreverAulas(i.numerosAula)}</span>
                    </span>
                    <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => setItens((l) => l.filter((x) => x.salaId !== i.salaId))}>Tirar</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {turno && (
            <Passo n={5} titulo="Objetivo">
              <Input placeholder="Ex.: Prova, Aula prática..." value={titulo} onChange={(e) => { setTitulo(e.target.value); setTituloEditado(true); }} />
              <p className="text-xs text-muted-foreground">Turma e disciplina já vêm da sua grade. Pode completar, ex.: &quot;Prova&quot;, &quot;Aula prática&quot;.</p>
              <Textarea placeholder="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </Passo>
          )}

          <Button type="button" className="w-full" disabled={enviando || !turno || totalAulas === 0 || !titulo.trim()} onClick={() => void enviar()}>
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {totalAulas > 1 ? `Solicitar ${totalAulas} reservas` : "Solicitar reserva"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function usePwaInstall() {
  const [prompt, setPrompt] = useState<any>(null);

  useMemo(() => {
    if (typeof window === "undefined") return;

    // Registra o manifest desta pagina especificamente (nao afeta o
    // resto do app administrativo).
    const linkExistente = document.querySelector('link[rel="manifest"][data-minha-agenda]');
    if (!linkExistente) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest-minha-agenda.json";
      link.setAttribute("data-minha-agenda", "true");
      document.head.appendChild(link);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-minha-agenda.js", { scope: "/minha-agenda" }).catch(() => {});
    }

    const handler = (e: any) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return prompt
    ? {
        podeInstalar: true,
        instalar: async () => {
          prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        },
      }
    : { podeInstalar: false, instalar: () => {} };
}

const ESTILO_IMPRESSAO = `
  @media print {
    /* [FIX] "A4 landscape" (palavra-chave) nem sempre e respeitado
       pelo dialogo de impressao do Chrome -- o radio "Retrato" fica
       selecionado por padrao mesmo com essa regra, cortando o
       conteudo. Dimensoes explicitas (297mm x 210mm = A4 deitado)
       sao mais confiaveis entre navegadores. */
    @page {
      size: 297mm 210mm;
      margin: 8mm;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 9px;
    }
    .imprimir-compacto td, .imprimir-compacto th {
      padding: 2px 4px !important;
      font-size: 8px !important;
    }
    .imprimir-cartao-aula {
      padding: 2px 3px !important;
    }
    .imprimir-sem-quebra {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .imprimir-oculto {
      display: none !important;
    }
  }
`;

export default function MinhaAgendaPage() {
  const { podeInstalar, instalar } = usePwaInstall();
  const { toast } = useToast();
  const [mostrarCalendario, setMostrarCalendario] = useState(true); // [AGENDA-CALENDARIO] visivel por padrao
  const queryClient = useQueryClient();
  const { data: professor, isLoading: carregandoProfessor } = useGetMeuProfessor();
  const { data: notificacoes } = useGetMinhaAgendaNotificacoes({
    query: { queryKey: getGetMinhaAgendaNotificacoesQueryKey(), enabled: !!professor, refetchInterval: 30000 },
  });
  const marcarLida = useMarcarMinhaNotificacaoLida({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMinhaAgendaNotificacoesQueryKey() }),
    },
  });
  const { data: dadosHorario, isLoading: carregandoHorario } = useGetMinhaAgendaHorario({
    query: { queryKey: getGetMinhaAgendaHorarioQueryKey(), enabled: !!professor },
  });
  const aulas = dadosHorario?.aulas;
  const [turnoAba, setTurnoAba] = useState<string | null>(null); // [AGENDA-ABAS]
  const { organization } = useOrganization(); // [AGENDA-ESCOLA]
  const { data: eu } = useEu(); // [ACESSOS-ESCOLA] com a chave ligada o nome vem do nosso banco
  const nomeEscola = (eu?.pelobanco ? eu.nomeEscola : null) ?? organization?.name;
  const [diaSel, setDiaSel] = useState<number | null>(null); // [AGENDA-DIA]
  const horasAtividade = dadosHorario?.horasAtividade ?? [];
  const ehHoraAtividade = (diaIdx: number, numeroAula: number) =>
    horasAtividade.some((h) => h.diaSemana === diaIdx && h.numeroAula === numeroAula);
  const { data: reservas, isLoading: carregandoReservas } = useGetMinhaAgendaReservas({
    query: { queryKey: getGetMinhaAgendaReservasQueryKey(), enabled: !!professor },
  });
  const { data: eventosCalendario } = useListCalendarioEscolar(
    { ano: new Date().getFullYear() },
    { query: { queryKey: ["calendario-escolar", new Date().getFullYear()], enabled: !!professor } },
  );
  const semana = useMemo(() => datasDaSemana(), []);
  /** evento sem aula num dia da semana mostrada (indice 0 = segunda) */
  const semAulaNoDia = useMemo(() => {
    const lista = (eventosCalendario ?? []) as EventoCal[];
    return semana.map((data) => lista.find((e) => e.data === data && TIPOS_SEM_AULA.has(e.tipo) && !e.diaLetivo) ?? null);
  }, [eventosCalendario, semana]);

  const maxAula = useMemo(() => {
    if (!aulas || aulas.length === 0) return 6;
    return Math.max(...aulas.map((a) => a.numeroAula), 6);
  }, [aulas]);
  const hojeDiaSemana = useMemo(() => {
    const dow = new Date().getDay();
    return dow === 0 ? 6 : dow - 1;
  }, []);

  // [PDF-AGENDA] (17/10/2026) PDF proprio gerado no servidor (1 pagina, todos os turnos),
  // em vez de imprimir a pagina (saia com menu, so a aba aberta e pagina em branco).
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  async function handleBaixarPdf() {
    setBaixandoPdf(true);
    try {
      const blob = await customFetchOcupacao<Blob>("/api/minha-agenda/agenda-pdf", { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agenda-${(professor?.nome ?? "professor").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast({ title: "Não foi possível gerar o PDF", description: "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setBaixandoPdf(false);
    }
  }

  if (carregandoProfessor) {
    return (
      <div className="min-h-screen p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!professor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Nenhum professor vinculado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sua conta não está associada a um cadastro de professor nesta escola.
              Fale com a coordenação para verificar seu cadastro.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <style>{ESTILO_IMPRESSAO}</style>
      <header className="border-b p-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Minha Agenda</h1>
          <p className="text-sm text-muted-foreground">{professor.nome}{nomeEscola && <> &middot; <span className="font-medium text-foreground">{nomeEscola}</span></>}</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell
            notificacoes={notificacoes}
            onMarcarLida={(id) => marcarLida.mutate({ id })}
          />
          <UserButton />
        </div>
      </header>

      <main className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-nowrap sm:flex-wrap gap-2 justify-end print:hidden [&>button]:px-3 sm:[&>button]:px-4">{/* [AGENDA-BOTOES] */}
          <Button
            variant={mostrarCalendario ? "default" : "outline"}
            onClick={() => setMostrarCalendario((v) => !v)}
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{mostrarCalendario ? "Ocultar calendário" : "Ver calendário"}</span><span className="sm:hidden">Calendário</span>
          </Button>
          {podeInstalar && (
            <Button variant="outline" onClick={instalar}>
              <MonitorSmartphone className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Instalar app</span><span className="sm:hidden">App</span>
            </Button>
          )}
          <Button variant="outline" onClick={() => void handleBaixarPdf()} disabled={baixandoPdf}>
            {baixandoPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            <span className="hidden sm:inline">Baixar PDF</span><span className="sm:hidden">PDF</span>
          </Button>
          <NovaReservaDialog professorId={professor.id} />
        </div>

        {mostrarCalendario && <CalendarioMesEscola reservas={(reservas ?? []) as unknown as ReservaNoCalendario[]} />}{/* [CALENDARIO-PROFESSOR] mesmo visual do Calendario Escolar */}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Grade de aulas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {carregandoHorario ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="overflow-x-auto">
                {(() => {
                  // [AGENDA-TURNOS] uma grade por turno (Manha, Tarde, Noite), com o horario de
                  // cada aula; sigla ou nome inteiro; celula livre vazia; coluna de hoje destacada.
                  const ORDEM = ["matutino", "vespertino", "noturno"];
                  const NOME_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
                  const listaAulas = (aulas ?? []) as any[];
                  const listaHA = (((dadosHorario as any)?.horasAtividade) ?? []) as any[];
                  const horarios = (((dadosHorario as any)?.horarios) ?? []) as any[];
                  const turnos = ORDEM.filter((tn) => listaAulas.some((a) => a.turno === tn) || listaHA.some((h) => h.turno === tn));
                  const semTurno = turnos.length === 0 || listaAulas.some((a) => a.turno === undefined);
                  const grupos: Array<string | null> = semTurno ? [null] : turnos;
                  // [AGENDA-ABAS] abre no turno do momento (ou no proximo turno do professor no dia)
                  const hAgora = new Date().getHours();
                  const turnoAgora = hAgora < 12 ? "matutino" : hAgora < 18 ? "vespertino" : "noturno";
                  const padrao = (grupos.find((g) => g !== null && ORDEM.indexOf(g) >= ORDEM.indexOf(turnoAgora)) ?? grupos[0]) as string | null;
                  const selecionado = turnoAba !== null && grupos.includes(turnoAba) ? turnoAba : padrao;
                  const abas = grupos.length > 1 ? (
                    <div key="abas-turno" className="flex items-center gap-1 border-b border-border mb-4 overflow-x-auto">
                      {grupos.map((g) => (
                        <button
                          key={g ?? "unico"}
                          type="button"
                          onClick={() => setTurnoAba(g)}
                          className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                            g === selecionado ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {NOME_TURNO[g ?? ""] ?? g}
                        </button>
                      ))}
                    </div>
                  ) : null;
                  return [abas, ...grupos.filter((g) => g === selecionado).map((turno) => {
                    const aulasT = listaAulas.filter((a) => turno === null || a.turno === turno);
                    const haT = listaHA.filter((h) => turno === null || h.turno === turno);
                    const horaDe = (n: number) => {
                      const s = horarios.find((x) => x.turno === turno && x.numeroAula === n);
                      return s?.horaInicio ? String(s.horaInicio).slice(0, 5) : "";
                    };
                    const maxT = Math.max(
                      5,
                      ...aulasT.map((a) => a.numeroAula),
                      ...haT.map((h) => h.numeroAula),
                      ...horarios.filter((x) => x.turno === turno).map((x) => x.numeroAula),
                    );
                    const ehHA = (d: number, n: number) => haT.some((h) => h.diaSemana === d && h.numeroAula === n);
                    // [HA-CONTRATURNO-ASTERISCO] aba de turno sem nenhuma aula na semana = contraturno
                    const haContraturno = turno !== null && aulasT.length === 0;
                    // [HA-OUTRO-TURNO] HA referente a aulas de outro turno tambem e HA*
                    const ehHAOutro = (d: number, n: number) => haT.some((h) => h.diaSemana === d && h.numeroAula === n && h.outroTurno === true);
                    const rotuloHA = (d: number, n: number) => (haContraturno || ehHAOutro(d, n) ? "HA*" : "HA");
                    const dicaHA = (d: number, n: number) => (haContraturno ? "Hora-atividade em contraturno (turno sem aula)" : ehHAOutro(d, n) ? "Hora-atividade de outro turno" : "Hora-atividade");
                    // [AGENDA-DIA] dia mostrado no celular: o escolhido, ou hoje (no fim de semana, segunda)
                    const diaAtivo = diaSel ?? (hojeDiaSemana >= 0 && hojeDiaSemana <= 4 ? hojeDiaSemana : 0);
                    const avisoPonto = (d: number, n: number) => {
                      const nums = Array.from({ length: maxT }, (_, k) => k + 1).filter((x) => aulasT.some((a) => a.diaSemana === d && a.numeroAula === x) || ehHA(d, x));
                      return n === Math.min(...nums) ? "registrar entrada (login no início)" : n === Math.max(...nums) ? "registrar saída (login no fim)" : null;
                    };
                    return (
                      <div key={turno ?? "unico"} className="mb-6 last:mb-0">
                        {turno && grupos.length === 1 && (
                          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{NOME_TURNO[turno] ?? turno}</h3>
                        )}
                        <div className="hidden md:block print:block">
                        <table className="w-full text-sm border-collapse imprimir-compacto">
                          <thead>
                            <tr>
                              <th className="text-left p-2 border-b w-20">Aula</th>
                              {DIAS.map((d, idx) => (
                                <th key={d} className={`text-left p-2 border-b align-top ${idx === hojeDiaSemana ? "text-primary font-semibold bg-primary/5" : ""}`}>
                                  {d}
                                  {idx === hojeDiaSemana && (
                                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                                  )}
                                  <span className="ml-1 text-[11px] font-normal text-muted-foreground print:hidden">{ddmm(semana[idx])}</span>
                                  {semAulaNoDia[idx] && (/* [AGENDA-CALENDARIO] */
                                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 text-white w-fit max-w-full truncate print:hidden" style={{ backgroundColor: COR_TIPO[semAulaNoDia[idx]!.tipo] ?? "#dc2626" }} title={semAulaNoDia[idx]!.descricao}>
                                      {ROTULO_TIPO[semAulaNoDia[idx]!.tipo] ?? semAulaNoDia[idx]!.tipo}: sem aula
                                    </div>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: maxT }, (_, i) => i + 1).map((numeroAula) => (
                              <tr key={numeroAula} className="imprimir-sem-quebra">
                                <td className="p-2 border-b align-top">
                                  <div className="font-medium">{numeroAula}ª</div>
                                  {horaDe(numeroAula) && <div className="text-[11px] text-muted-foreground">{horaDe(numeroAula)}</div>}
                                </td>
                                {DIAS.map((_, diaIdx) => {
                                  const aula = aulasT.find((a) => a.diaSemana === diaIdx && a.numeroAula === numeroAula);
                                  const hoje = diaIdx === hojeDiaSemana;
                                  return (
                                    <td key={diaIdx} className={`p-2 border-b h-14 ${hoje ? "bg-primary/5" : ""} ${semAulaNoDia[diaIdx] ? "opacity-40 print:opacity-100" : ""}`}>
                                      {aula ? (
                                        <div
                                          className="h-full rounded-md p-2 border-l-4 imprimir-cartao-aula"
                                          style={{ backgroundColor: `${aula.disciplinaCor ?? "#1565C0"}15`, borderLeftColor: aula.disciplinaCor ?? "#1565C0" }}
                                          title={`${aula.disciplinaNome} — ${aula.turmaNome}${aula.sala ? " · " + aula.sala : ""}`}
                                        >
                                          <div className="font-semibold text-sm leading-tight break-words">
                                            {aula.disciplinaSigla ? String(aula.disciplinaSigla).toUpperCase() : aula.disciplinaNome}
                                          </div>
                                          <div className="text-xs text-muted-foreground truncate">
                                            {aula.turmaNome}{aula.sala ? ` · ${aula.sala}` : ""}
                                          </div>
                                          {(aula as any).trio && (
                                            <div className="mt-1">{/* [REVEZAMENTO-TRIO] */}
                                              <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${(aula as any).trio.presencial ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{(aula as any).trio.presencial ? "Trio: presencial esta semana" : "Trio: suporte esta semana"}</span>
                                            </div>
                                          )}
                                          {aula.assincrona && (() => {
                                            const nums = Array.from({ length: maxT }, (_, k) => k + 1).filter((n) =>
                                              aulasT.some((x) => x.diaSemana === diaIdx && x.numeroAula === n) || ehHA(diaIdx, n));
                                            const aviso = numeroAula === Math.min(...nums) ? "registrar entrada (login no início)"
                                              : numeroAula === Math.max(...nums) ? "registrar saída (login no fim)" : null;
                                            return (
                                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wide rounded bg-violet-100 text-violet-800 px-1.5 py-0.5">Assíncrona</span>
                                                {aviso && <span className="text-[10px] font-semibold text-rose-700">{aviso}</span>}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      ) : ehHA(diaIdx, numeroAula) ? (
                                        <div className="h-full rounded-md p-2 border-l-4 bg-amber-50 border-amber-400 flex items-center justify-center imprimir-cartao-aula">
                                          <span className="text-xs font-semibold text-amber-700" title={dicaHA(diaIdx, numeroAula)}>{rotuloHA(diaIdx, numeroAula)}</span>
                                        </div>
                                      ) : null}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                        {/* [AGENDA-DIA] celular na vertical: um dia por vez, em lista */}
                        <div className="md:hidden print:hidden">
                          <div className="flex gap-1 mb-3">
                            {DIAS.map((d, idx) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setDiaSel(idx)}
                                className={`flex-1 rounded-md px-1 py-2 text-sm font-medium border transition-colors ${
                                  idx === diaAtivo ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
                                }`}
                              >
                                {d.slice(0, 3)}{idx === hojeDiaSemana ? " •" : ""}
                                <span className="block text-[10px] font-normal opacity-80">{ddmm(semana[idx])}{semAulaNoDia[idx] ? " ✕" : ""}</span>
                              </button>
                            ))}
                          </div>
                          {semAulaNoDia[diaAtivo] && (/* [AGENDA-CALENDARIO] */
                            <div className="mb-3 rounded-md px-3 py-2 text-sm text-white" style={{ backgroundColor: COR_TIPO[semAulaNoDia[diaAtivo]!.tipo] ?? "#dc2626" }}>
                              <strong>{ROTULO_TIPO[semAulaNoDia[diaAtivo]!.tipo] ?? semAulaNoDia[diaAtivo]!.tipo}</strong>: {semAulaNoDia[diaAtivo]!.descricao}. Sem aula neste dia.
                            </div>
                          )}
                          <div className={`space-y-2 ${semAulaNoDia[diaAtivo] ? "opacity-40" : ""}`}>
                            {Array.from({ length: maxT }, (_, i) => i + 1).map((n) => {
                              const aula = aulasT.find((a) => a.diaSemana === diaAtivo && a.numeroAula === n);
                              const aviso = aula?.assincrona ? avisoPonto(diaAtivo, n) : null;
                              return (
                                <div key={n} className="flex items-stretch gap-3">
                                  <div className="w-14 shrink-0 pt-1">
                                    <div className="font-medium text-sm">{n}ª</div>
                                    {horaDe(n) && <div className="text-[11px] text-muted-foreground">{horaDe(n)}</div>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {aula ? (
                                      <div
                                        className="rounded-md px-3 py-2 border-l-4"
                                        style={{ backgroundColor: `${aula.disciplinaCor ?? "#1565C0"}15`, borderLeftColor: aula.disciplinaCor ?? "#1565C0" }}
                                      >
                                        <div className="font-semibold text-sm">{aula.disciplinaSigla ? String(aula.disciplinaSigla).toUpperCase() : aula.disciplinaNome}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {aula.turmaNome}{aula.sala ? ` · ${aula.sala}` : ""}
                                          {aula.disciplinaSigla && <span> · {aula.disciplinaNome}</span>}
                                        </div>
                                        {(aula as any).trio && (
                                          <div className="mt-1">{/* [REVEZAMENTO-TRIO] */}
                                            <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${(aula as any).trio.presencial ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{(aula as any).trio.presencial ? "Trio: presencial esta semana" : "Trio: suporte esta semana"}</span>
                                          </div>
                                        )}
                                        {aula.assincrona && (
                                          <div className="mt-1 flex flex-wrap items-center gap-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wide rounded bg-violet-100 text-violet-800 px-1.5 py-0.5">Assíncrona</span>
                                            {aviso && <span className="text-[10px] font-semibold text-rose-700">{aviso}</span>}
                                          </div>
                                        )}
                                      </div>
                                    ) : ehHA(diaAtivo, n) ? (
                                      <div className="rounded-md px-3 py-2 border-l-4 bg-amber-50 border-amber-400 text-sm font-semibold text-amber-700" title={dicaHA(diaAtivo, n)}>{rotuloHA(diaAtivo, n)}</div>
                                    ) : (
                                      <div className="rounded-md px-3 py-2 border border-dashed text-xs text-muted-foreground">Livre</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })];
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Minhas reservas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {carregandoReservas ? (
              <Skeleton className="h-24 w-full" />
            ) : !reservas || reservas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma reserva ativa.</p>
            ) : (
              reservas.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between border rounded-md p-3 border-l-4 imprimir-sem-quebra"
                  style={{
                    borderLeftColor: r.status === "confirmada" ? "#22c55e" : "#f59e0b",
                  }}
                >
                  <div>
                    <div className="font-medium">{r.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.data} · {r.numeroAula}ª aula · {r.salaNome}
                    </div>
                  </div>
                  <Badge variant={r.status === "confirmada" ? "default" : "secondary"}>
                    {r.status === "confirmada" ? "Confirmada" : r.status === "pendente" ? "Pendente" : r.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// [CALENDARIO-RESERVA] calendario do mes com a ocupacao do espaco escolhido.
// verde = livre | ambar = parcialmente ocupado | cinza = lotado (nao escolhe).
// Dias passados e fins de semana desabilitados. Sem nomes de quem reservou.
type OcupacaoMesResp = { mes: string; maxAula: number; dias: Record<string, { confirmadas: number; pendentes: number }> };

function CalendarioReserva({ salaId, value, onChange, diasComReserva = [] }: { salaId: number; value: string; onChange: (iso: string) => void; diasComReserva?: string[] }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const selecionada = /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : undefined;
  const [mesVisivel, setMesVisivel] = useState<Date>(selecionada ?? hoje);
  const mesISO = formatarDataCal(mesVisivel, "yyyy-MM");
  const { data: oc } = useQueryOcupacao({
    queryKey: ["ocupacao-mes", salaId, mesISO],
    queryFn: () => customFetchOcupacao<OcupacaoMesResp>(
      "/api/minha-agenda/ocupacao-mes?salaId=" + salaId + "&mes=" + mesISO,
      { responseType: "json" },
    ),
    enabled: salaId > 0,
  });

  const livre: Date[] = [];
  const parcial: Date[] = [];
  const lotado: Date[] = [];
  if (oc) {
    const ano = mesVisivel.getFullYear();
    const mes = mesVisivel.getMonth();
    const total = new Date(ano, mes + 1, 0).getDate();
    for (let d = 1; d <= total; d++) {
      const dia = new Date(ano, mes, d);
      const dow = dia.getDay();
      if (dow === 0 || dow === 6 || dia < hoje) continue;
      const info = oc.dias[formatarDataCal(dia, "yyyy-MM-dd")];
      if (!info || info.confirmadas + info.pendentes === 0) livre.push(dia);
      else if (info.confirmadas >= oc.maxAula) lotado.push(dia);
      else parcial.push(dia);
    }
  }

  return (
    <div className="space-y-2">
      <CalendarioUI
        mode="single"
        locale={ptBRCalendario}
        selected={selecionada}
        onSelect={(d) => { if (d) onChange(formatarDataCal(d, "yyyy-MM-dd")); }}
        month={mesVisivel}
        onMonthChange={setMesVisivel}
        disabled={[{ before: hoje }, { dayOfWeek: [0, 6] }, ...lotado]}
        modifiers={{ livre, parcial, lotado, minhaReserva: diasComReserva.map((iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))) }}
        modifiersClassNames={{
          // [RESERVA-NO-CALENDARIO] dia em que o professor ja tem reserva: sublinhado azul
          minhaReserva: "[&>button]:font-bold [&>button]:underline [&>button]:decoration-[#1565C0] [&>button]:decoration-2 [&>button]:underline-offset-4",
          livre: "[&>button]:bg-emerald-50 [&>button]:text-emerald-800",
          parcial: "[&>button]:bg-amber-100 [&>button]:text-amber-900",
          lotado: "[&>button]:bg-muted [&>button]:text-muted-foreground [&>button]:line-through",
        }}
        className="rounded-md border"
      />
      {salaId > 0 ? (
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" /> Livre</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" /> Algumas aulas reservadas</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-muted ring-1 ring-border" /> Lotado</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Depois de escolher o espaço, os dias ficam coloridos com a ocupação dele.</p>
      )}
      {diasComReserva.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-bold text-foreground underline decoration-[#1565C0] decoration-2 underline-offset-4">12</span> dia em que você já tem reserva
        </p>
      )}
    </div>
  );
}
