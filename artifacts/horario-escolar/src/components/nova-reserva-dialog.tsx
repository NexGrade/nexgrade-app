import { useEffect, useMemo, useState } from "react";
import { useQuery as useQueryOcupacao, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarioUI } from "@/components/ui/calendar"; // [CALENDARIO-RESERVA]
import { ptBR as ptBRCalendario } from "react-day-picker/locale"; // [CALENDARIO-RESERVA]
import { format as formatarDataCal } from "date-fns"; // [CALENDARIO-RESERVA]
import { Loader2, Plus } from "lucide-react";
import {
  customFetch as customFetchOcupacao,
  getGetMinhaAgendaReservasQueryKey,
  useGetMinhaAgendaReservas,
  useListSalas,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ehSalaTablets } from "@/lib/reservas-formato"; // tablets agora vao por quantidade (passo proprio)

// [NOVA-RESERVA-COMPARTILHADA] (17/10/2026) A mesma "Nova reserva" serve ao professor (Minha Agenda,
// passa pela aprovacao) e ao gestor de reservas (portal: escolhe o professor, ja nasce confirmada).

function diaSemanaDaData(dataISO: string): number {
  // dataISO no formato YYYY-MM-DD. getUTCDay(): 0=domingo..6=sabado.
  // Convertido para 0=segunda..4=sexta (mesma convencao do backend).
  const d = new Date(`${dataISO}T00:00:00Z`);
  const dow = d.getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

// [RECURSOS-TABLETS] (17/10/2026) Reserva de tablets: secao propria, por QUANTIDADE (carrinho com
// total fixo), sem escolher espaco. Confirma na hora; varios professores na mesma aula ate o total.
export type ReservaTablet = { id: number; data: string; diaSemana: number; numeroAula: number; turno: string; quantidade: number; titulo: string; observacoes: string | null; status: string; recursoNome: string };
type OcupacaoRecursosResp = { data: string; recursos: Array<{ id: number; nome: string; total: number; ocupacao: Array<{ numeroAula: number; turno: string; reservadas: number }> }> };
export const CHAVE_TABLETS = ["reservas-tablets"] as const;

export function useReservasTablets(enabled: boolean) {
  return useQueryOcupacao({
    queryKey: CHAVE_TABLETS,
    queryFn: () => customFetchOcupacao<ReservaTablet[]>("/api/minha-agenda/recursos/reservas", { responseType: "json" }),
    enabled,
  });
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

type ProfessorOpcao = { id: number; nome: string; ativo?: boolean | null };


export function NovaReservaDialog({ modo = "professor", professores = [], aoCriar }: { modo?: "professor" | "gestor"; professores?: ProfessorOpcao[]; aoCriar?: () => void }) {
  const gestor = modo === "gestor";
  const BASE = gestor ? "/api/reservas/gestor" : "/api/minha-agenda";
  const off = gestor ? 1 : 0; // no gestor o passo 1 e escolher o professor
  const [professorSel, setProfessorSel] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: salas } = useListSalas();
  const { data: minhasReservas } = useGetMinhaAgendaReservas({ query: { queryKey: getGetMinhaAgendaReservasQueryKey(), enabled: !gestor } }); // [RESERVA-NO-CALENDARIO]
  const { data: minhasReservasTablets } = useReservasTablets(!gestor); // [RECURSOS-TABLETS]
  // grade do professor: o logado (Minha Agenda) ou o escolhido pelo gestor
  const { data: dadosHorarioApi } = useQueryOcupacao({
    queryKey: ["horario-reserva", modo, professorSel],
    queryFn: () => customFetchOcupacao<unknown>(`${BASE}/horario${gestor ? `?professorId=${professorSel}` : ""}`, { responseType: "json" }),
    enabled: !gestor || professorSel > 0,
  });
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
  // [RECURSOS-TABLETS] passo opcional: quantidade de tablets por aula (carrinho com total fixo, sem espaco)
  const [quantidade, setQuantidade] = useState("");
  const [tablets, setTablets] = useState<Record<number, number>>({});

  const limpar = () => { setProfessorSel(0); setData(""); setTurno(null); setAulasSel([]); setSalaAtual(0); setItens([]); setTitulo(""); setTituloEditado(false); setObservacoes(""); setQuantidade(""); setTablets({}); };
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
    queryFn: () => customFetchOcupacao<OcupacaoDiaResp>(`${BASE}/ocupacao?data=` + encodeURIComponent(data), { responseType: "json" }),
    enabled: diaSemana >= 0 && diaSemana <= 4,
  });
  const statusSala = (salaId: number, numeroAula: number) =>
    ocupacao?.ocupacao.find((o) => o.salaId === salaId && o.numeroAula === numeroAula && (!o.turno || o.turno === turno))?.status ?? null;

  const { data: ocupacaoRecursos } = useQueryOcupacao({
    queryKey: ["ocupacao-recursos", data],
    queryFn: () => customFetchOcupacao<OcupacaoRecursosResp>(`${BASE}/recursos/ocupacao?data=` + encodeURIComponent(data), { responseType: "json" }),
    enabled: diaSemana >= 0 && diaSemana <= 4,
  });
  const recurso = ocupacaoRecursos?.recursos[0] ?? null;
  const restamTablets = (numeroAula: number) =>
    recurso ? recurso.total - recurso.ocupacao.filter((o) => o.numeroAula === numeroAula && o.turno === turno).reduce((n, o) => n + o.reservadas, 0) : 0;
  const menorSaldo = aulasSel.length ? Math.min(...aulasSel.map(restamTablets)) : (recurso?.total ?? 0);
  const qtd = Number(quantidade);
  const qtdValida = Number.isInteger(qtd) && qtd >= 1 && qtd <= menorSaldo;
  const comTablets = quantidade !== "" && aulasSel.length > 0;
  const podeAddTablets = comTablets && qtdValida;

  // [RESERVA-VARIOS-ESPACOS] a mesma aula pode ir para outro espaco (turma dividida);
  // so fica travada a aula que ja esta na lista PARA O ESPACO escolhido agora
  const espacosDaAula = (n: number) => itens.filter((i) => i.numerosAula.includes(n)).map((i) => i.salaId);
  const ocupadasNaSala = salaAtual ? aulasSel.filter((n) => statusSala(salaAtual, n) === "confirmada") : [];
  const podeAddSala = salaAtual > 0 && aulasSel.length > 0 && ocupadasNaSala.length === 0;
  // o botao serve para espaco, tablets ou os dois juntos (as mesmas aulas marcadas)
  const podeAdicionar = (podeAddSala || (salaAtual === 0 && podeAddTablets)) && (quantidade === "" || qtdValida);
  const nomeSala = (id: number) => salas?.find((s) => s.id === id)?.nome ?? "Espaço";
  const rotuloAula = (n: number) => {
    const h = horariosDoTurno.find((x) => x.numeroAula === n);
    return `${n}ª${h?.hora ? ` (${h.hora})` : ""}`;
  };

  function adicionar() {
    if (!podeAdicionar) return;
    if (podeAddSala) {
      setItens((l) => {
        const ja = l.find((i) => i.salaId === salaAtual);
        if (ja) return l.map((i) => (i.salaId === salaAtual ? { ...i, numerosAula: [...new Set([...i.numerosAula, ...aulasSel])].sort((x, y) => x - y) } : i));
        return [...l, { salaId: salaAtual, numerosAula: [...aulasSel].sort((x, y) => x - y) }];
      });
    }
    if (podeAddTablets) setTablets((t) => ({ ...t, ...Object.fromEntries(aulasSel.map((n) => [n, qtd])) }));
    setAulasSel([]);
    setSalaAtual(0);
    setQuantidade("");
  }

  const itensFinais: ItemReserva[] = podeAddSala
    ? (() => {
        const ja = itens.find((i) => i.salaId === salaAtual);
        return ja
          ? itens.map((i) => (i.salaId === salaAtual ? { ...i, numerosAula: [...new Set([...i.numerosAula, ...aulasSel])] } : i))
          : [...itens, { salaId: salaAtual, numerosAula: aulasSel }];
      })()
    : itens;
  const totalAulas = itensFinais.reduce((n, i) => n + i.numerosAula.length, 0);
  // tablets que vao no pedido: os da lista mais a selecao atual, se estiver valida
  const tabletsFinais: Record<number, number> = podeAddTablets ? { ...tablets, ...Object.fromEntries(aulasSel.map((n) => [n, qtd])) } : tablets;
  const aulasComTablets = Object.keys(tabletsFinais).map(Number).sort((x, y) => x - y);
  const nomeTablets = (recurso?.nome ?? "Tablets").toLowerCase();
  // turma e disciplina das aulas escolhidas (vem da grade do professor no dia)
  const aulaDe = (n: number) => horariosDoTurno.find((x) => x.numeroAula === n)?.aula ?? null;
  const descreverAulas = (nums: number[]) =>
    [...new Set(nums.map(aulaDe).filter((a): a is NonNullable<typeof a> => !!a).map((a) => `${a.disciplinaNome} · ${a.turmaNome}`))].join("; ");
  const tituloAuto = descreverAulas([...new Set([...itensFinais.flatMap((i) => i.numerosAula), ...aulasComTablets])]);
  useEffect(() => { if (!tituloEditado) setTitulo(tituloAuto); }, [tituloAuto, tituloEditado]);

  async function enviar() {
    if (!turno || !data || (totalAulas === 0 && aulasComTablets.length === 0) || !titulo.trim() || (comTablets && !qtdValida)) return;
    setEnviando(true);
    let espacosFeitos = false;
    const atualizar = () => {
      queryClient.invalidateQueries({ queryKey: getGetMinhaAgendaReservasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-salas"] });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-mes"] });
      queryClient.invalidateQueries({ queryKey: CHAVE_TABLETS });
      queryClient.invalidateQueries({ queryKey: ["ocupacao-recursos"] });
      aoCriar?.();
    };
    try {
      let r: { criadas: number; confirmadas: number; pendentes: number } | null = null;
      if (itensFinais.length > 0) {
        r = await customFetchOcupacao<{ criadas: number; confirmadas: number; pendentes: number }>(gestor ? `${BASE}/lote` : `${BASE}/reservas/lote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(gestor ? { professorId: professorSel } : {}), data, turno, itens: itensFinais, titulo: titulo.trim(), observacoes: observacoes.trim() || undefined }),
          responseType: "json",
        });
        espacosFeitos = true;
      }
      if (aulasComTablets.length > 0 && recurso) {
        await customFetchOcupacao(gestor ? `${BASE}/recursos` : `${BASE}/recursos/reservas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(gestor ? { professorId: professorSel } : {}), recursoId: recurso.id, data, turno, itens: aulasComTablets.map((n) => ({ numeroAula: n, quantidade: tabletsFinais[n] })), titulo: titulo.trim(), observacoes: observacoes.trim() || undefined }),
          responseType: "json",
        });
      }
      atualizar();
      const textoTablets = aulasComTablets.length ? `${recurso?.nome ?? "Tablets"} confirmados (${aulasComTablets.map((n) => `${n}ª aula: ${tabletsFinais[n]}`).join(", ")}).` : "";
      toast(r ? {
        title: r.pendentes === 0 ? (r.criadas > 1 ? `${r.criadas} reservas confirmadas` : "Reserva confirmada") : r.confirmadas === 0 ? "Solicitação enviada" : `${r.confirmadas} confirmada(s), ${r.pendentes} aguardando`,
        description: [r.pendentes > 0 ? "As reservas pendentes entraram na fila de aprovação da coordenação." : gestor ? "Reservas confirmadas e o professor foi avisado." : "Tudo certo, as reservas já estão na sua agenda.", textoTablets].filter(Boolean).join(" "),
      } : { title: `${recurso?.nome ?? "Tablets"} reservados`, description: textoTablets });
      setOpen(false);
      limpar();
    } catch (err: any) {
      atualizar();
      if (espacosFeitos) {
        // os espacos ja foram gravados: nao deixa tentar de novo tudo junto (daria conflito com a propria reserva)
        toast({ title: "Espaços reservados, mas os tablets não", description: `${err?.data?.error ?? "Não foi possível reservar os tablets."} Abra Nova reserva e tente só os tablets.`, variant: "destructive" });
        setOpen(false);
        limpar();
      } else {
        toast({ title: "Não foi possível reservar", description: err?.data?.error ?? "Verifique os horários e tente de novo.", variant: "destructive" });
      }
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
          <DialogTitle>{gestor ? "Nova reserva para professor" : "Reservar espaço"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {gestor && (
            <Passo n={1} titulo="Professor">
              <Select
                value={professorSel ? String(professorSel) : undefined}
                onValueChange={(v) => { setProfessorSel(Number(v)); setData(""); setTurno(null); setAulasSel([]); setSalaAtual(0); setItens([]); setTablets({}); setQuantidade(""); setTituloEditado(false); }}
              >
                <SelectTrigger><SelectValue placeholder="Para qual professor?" /></SelectTrigger>
                <SelectContent>
                  {professores.filter((p) => p.ativo !== false).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A reserva já nasce confirmada e o professor recebe um aviso. Só aparecem as aulas dele naquele dia.</p>
            </Passo>
          )}

          {(!gestor || professorSel > 0) && (
          <Passo n={1 + off} titulo="Dia">
            <CalendarioReserva
              base={BASE}
              diasComReserva={[...new Set([...(minhasReservas ?? []), ...(minhasReservasTablets ?? [])].map((r) => String(r.data).slice(0, 10)))]}
              salaId={salaAtual}
              value={data}
              onChange={(iso) => { setData(iso); setTurno(null); setAulasSel([]); setItens([]); }}
            />
          </Passo>
          )}

          {data && (
            <Passo n={2 + off} titulo="Período">
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
            <Passo n={3 + off} titulo="Aulas (pode marcar mais de uma)">
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
            <Passo n={4 + off} titulo="Espaço">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={salaAtual ? String(salaAtual) : undefined} onValueChange={(v) => setSalaAtual(Number(v))}>
                  <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Escolha o espaço" /></SelectTrigger>
                  <SelectContent>
                    {salas?.filter((s) => s.ativa !== false && !ehSalaTablets(s.nome)).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>)}
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
              <p className="text-xs text-muted-foreground">Precisa de outro espaço? Adicione à lista e escolha o próximo, nas mesmas aulas (turma dividida) ou em outras. Só precisa de tablets? Deixe o espaço em branco e use o passo dos tablets.</p>
            </Passo>
          )}

          {turno && recurso && (
            <Passo n={5 + off} titulo="Tablets (opcional)">
              <div className="space-y-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(menorSaldo, 1)}
                  placeholder={`${recurso.nome} (opcional): quantos?`}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
                <p className={`text-xs ${comTablets && !qtdValida ? "text-destructive" : "text-muted-foreground"}`}>
                  {aulasSel.length === 0
                    ? `Marque as aulas acima. O carrinho tem ${recurso.total} ${nomeTablets}.`
                    : comTablets && !qtdValida
                      ? menorSaldo < 1 ? `Não há ${nomeTablets} livres nessas aulas.` : `Informe de 1 a ${menorSaldo}.`
                      : `Livres nas aulas marcadas: ${menorSaldo} de ${recurso.total}. Você leva os ${nomeTablets} para a sua sala; confirma na hora.`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Entra no pedido ao solicitar. Para juntar espaço e tablets em aulas diferentes, use &quot;Adicionar à lista&quot; no passo do espaço a cada vez.</p>
            </Passo>
          )}

          {(itens.length > 0 || Object.keys(tablets).length > 0) && (
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
                {[...new Set(Object.values(tablets))].map((q) => {
                  const aulasQ = Object.entries(tablets).filter(([, v]) => v === q).map(([k]) => Number(k)).sort((x, y) => x - y);
                  return (
                    <li key={`tablets-${q}`} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <strong>{recurso?.nome ?? "Tablets"}</strong> · {q} {q === 1 ? "unidade" : "unidades"} · {aulasQ.map(rotuloAula).join(", ")} aula
                      </span>
                      <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => setTablets((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== q)))}>Tirar</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {turno && (
            <Passo n={6 + off} titulo="Objetivo">
              <Input placeholder="Ex.: Prova, Aula prática..." value={titulo} onChange={(e) => { setTitulo(e.target.value); setTituloEditado(true); }} />
              <p className="text-xs text-muted-foreground">Turma e disciplina já vêm da sua grade. Pode completar, ex.: &quot;Prova&quot;, &quot;Aula prática&quot;.</p>
              <Textarea placeholder="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </Passo>
          )}

          <Button type="button" className="w-full" disabled={enviando || (gestor && !professorSel) || !turno || (totalAulas === 0 && aulasComTablets.length === 0) || !titulo.trim() || (comTablets && !qtdValida)} onClick={() => void enviar()}>
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {totalAulas === 0 ? "Reservar tablets" : aulasComTablets.length > 0 ? "Solicitar reservas" : totalAulas > 1 ? `Solicitar ${totalAulas} reservas` : "Solicitar reserva"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// [CALENDARIO-RESERVA] calendario do mes com a ocupacao do espaco escolhido.
// verde = livre | ambar = parcialmente ocupado | cinza = lotado (nao escolhe).
// Dias passados e fins de semana desabilitados. Sem nomes de quem reservou.
type OcupacaoMesResp = { mes: string; maxAula: number; dias: Record<string, { confirmadas: number; pendentes: number }> };

function CalendarioReserva({ base, salaId, value, onChange, diasComReserva = [] }: { base: string; salaId: number; value: string; onChange: (iso: string) => void; diasComReserva?: string[] }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const selecionada = /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : undefined;
  const [mesVisivel, setMesVisivel] = useState<Date>(selecionada ?? hoje);
  const mesISO = formatarDataCal(mesVisivel, "yyyy-MM");
  const { data: oc } = useQueryOcupacao({
    queryKey: ["ocupacao-mes", base, salaId, mesISO],
    queryFn: () => customFetchOcupacao<OcupacaoMesResp>(
      base + "/ocupacao-mes?salaId=" + salaId + "&mes=" + mesISO,
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
