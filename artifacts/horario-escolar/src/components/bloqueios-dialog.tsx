import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";
import { customFetch, useListSalas } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { NOME_TURNO, ehSalaTablets } from "@/lib/reservas-formato";

// [BLOQUEIOS] (17/10/2026) Gestor de reservas, coordenacao, direcao e secretaria bloqueiam salas e equipamentos
// (manutencao, limpeza, outro motivo) por um periodo. Enquanto bloqueado, o espaco nao aceita reserva e as unidades
// bloqueadas saem do saldo do equipamento. Remover = liberar.
export type BloqueioItem = {
  id: number;
  alvoTipo: "sala" | "recurso";
  alvoId: number | null;
  alvoNome: string;
  quantidade: number | null;
  dataInicio: string;
  dataFim: string;
  turno: string | null;
  numerosAula: number[];
  motivo: string;
  motivoRotulo: string;
  descricao: string | null;
  criadoPor: string;
};
type RecursoOpcao = { id: number; nome: string; quantidadeTotal: number };

export const CHAVE_BLOQUEIOS = ["bloqueios"] as const;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const periodoTexto = (b: BloqueioItem) => (b.dataInicio === b.dataFim ? ddmm(b.dataInicio) : `${ddmm(b.dataInicio)} a ${ddmm(b.dataFim)}`);
const quandoTexto = (b: BloqueioItem) =>
  `${b.numerosAula.length ? `${b.numerosAula.map((n) => `${n}ª`).join(", ")} aula${b.numerosAula.length > 1 ? "s" : ""}` : "dia inteiro"}${b.turno ? ` · ${NOME_TURNO[b.turno] ?? b.turno}` : " · todos os períodos"}`;

export function BotaoBloqueios({ aoMudar }: { aoMudar?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);

  const [alvo, setAlvo] = useState(""); // "sala:12" | "recurso:3"
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState<"manutencao" | "limpeza" | "outro">("manutencao");
  const [descricao, setDescricao] = useState("");
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [turno, setTurno] = useState("todos");
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [aulas, setAulas] = useState<number[]>([]);

  const { data: salas } = useListSalas();
  const { data: recursos } = useQuery({
    queryKey: ["recursos-bloqueio"],
    queryFn: () => customFetch<RecursoOpcao[]>("/api/recursos", { responseType: "json" }),
    enabled: aberto,
  });
  const { data: lista, isLoading } = useQuery({
    queryKey: CHAVE_BLOQUEIOS,
    queryFn: () => customFetch<BloqueioItem[]>("/api/reservas/bloqueios", { responseType: "json" }),
    enabled: aberto,
  });

  const [tipoAlvo, idAlvo] = alvo ? [alvo.split(":")[0] as "sala" | "recurso", Number(alvo.split(":")[1])] : [null, 0];
  const recursoSel = tipoAlvo === "recurso" ? recursos?.find((r) => r.id === idAlvo) : undefined;

  const limpar = () => {
    setAlvo(""); setQuantidade(""); setMotivo("manutencao"); setDescricao(""); setDataInicio(hojeISO()); setDataFim(hojeISO()); setTurno("todos"); setDiaInteiro(true); setAulas([]);
  };
  const atualizar = () => {
    queryClient.invalidateQueries({ queryKey: CHAVE_BLOQUEIOS });
    queryClient.invalidateQueries({ queryKey: ["ocupacao-recursos"] });
    queryClient.invalidateQueries({ queryKey: ["ocupacao-salas"] });
    queryClient.invalidateQueries({ queryKey: ["ocupacao-mes"] });
    aoMudar?.();
  };

  async function criar() {
    if (!tipoAlvo) { toast({ title: "Escolha o que será bloqueado", variant: "destructive" }); return; }
    if (dataFim < dataInicio) { toast({ title: "A data final não pode ser antes da inicial", variant: "destructive" }); return; }
    if (!diaInteiro && aulas.length === 0) { toast({ title: "Marque as aulas ou deixe \"Dia inteiro\"", variant: "destructive" }); return; }
    if (motivo === "outro" && !descricao.trim()) { toast({ title: "Descreva o motivo", variant: "destructive" }); return; }
    const qtd = quantidade.trim() === "" ? undefined : Number(quantidade);
    if (tipoAlvo === "recurso" && qtd !== undefined && (!Number.isInteger(qtd) || qtd < 1)) { toast({ title: "Informe a quantidade com um número inteiro (ou deixe vazio para todas)", variant: "destructive" }); return; }

    const corpo = {
      alvoTipo: tipoAlvo,
      alvoId: idAlvo,
      ...(tipoAlvo === "recurso" && qtd !== undefined ? { quantidade: qtd } : {}),
      dataInicio,
      dataFim,
      turno: turno === "todos" ? null : turno,
      numerosAula: diaInteiro ? null : aulas,
      motivo,
      ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
    };
    const enviar = (extra: object) =>
      customFetch<{ id?: number; reservasAfetadas: number }>("/api/reservas/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, ...extra }),
        responseType: "json",
      });
    setEnviando(true);
    try {
      const previa = await enviar({ somenteConferir: true });
      if (previa.reservasAfetadas > 0 && !window.confirm(`Já há ${previa.reservasAfetadas} reserva(s) nesse período. Elas ficarão PENDENTES e os professores serão avisados. Bloquear mesmo assim?`)) return;
      await enviar({});
      toast({ title: "Bloqueio criado", description: previa.reservasAfetadas > 0 ? `${previa.reservasAfetadas} reserva(s) ficaram pendentes e os professores foram avisados.` : "O espaço não aceita mais reservas nesse período." });
      limpar();
      setNovo(false);
      atualizar();
    } catch (err: any) {
      toast({ title: "Não foi possível bloquear", description: err?.data?.error ?? "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function liberar(b: BloqueioItem) {
    if (!window.confirm(`Liberar ${b.alvoNome} (${b.motivoRotulo}, ${periodoTexto(b)})? Ele volta a aceitar reservas.`)) return;
    setRemovendo(b.id);
    try {
      await customFetch(`/api/reservas/bloqueios/${b.id}`, { method: "DELETE", responseType: "json" });
      toast({ title: "Bloqueio removido", description: `${b.alvoNome} foi liberado.` });
      atualizar();
    } catch (err: any) {
      toast({ title: "Não foi possível liberar", description: err?.data?.error ?? "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) { setNovo(false); limpar(); } }}>
      <DialogTrigger asChild>
        <Button data-testid="button-bloqueios" variant="outline">
          <Ban className="mr-2 h-4 w-4" /> Bloqueios
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Bloqueios de salas e equipamentos</DialogTitle>
          <DialogDescription>Para manutenção, limpeza ou outro motivo. Enquanto bloqueado, o espaço não aceita reservas e os equipamentos bloqueados saem do saldo.</DialogDescription>
        </DialogHeader>

        {!novo ? (
          <div className="space-y-3">
            <Button type="button" onClick={() => setNovo(true)}><Plus className="mr-2 h-4 w-4" /> Novo bloqueio</Button>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : !lista || lista.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum bloqueio ativo.</p>
            ) : (
              <ul className="space-y-2">
                {lista.map((b) => (
                  <li key={b.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{b.alvoNome}{b.alvoTipo === "recurso" ? ` · ${b.quantidade ?? "todas as"} unidades` : ""}</span>
                        <Badge variant="secondary">{b.motivoRotulo}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{periodoTexto(b)} · {quandoTexto(b)}</p>
                      <p className="text-xs text-muted-foreground">Por {b.criadoPor}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive" disabled={removendo === b.id} onClick={() => void liberar(b)}>
                      {removendo === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="mr-1 h-4 w-4" /> Liberar</>}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">O que bloquear</label>
              <Select value={alvo || undefined} onValueChange={setAlvo}>
                <SelectTrigger><SelectValue placeholder="Escolha o espaço ou o equipamento" /></SelectTrigger>
                <SelectContent>
                  {(salas ?? []).filter((s) => s.ativa !== false && !ehSalaTablets(s.nome)).map((s) => <SelectItem key={`s${s.id}`} value={`sala:${s.id}`}>{s.nome}</SelectItem>)}
                  {(recursos ?? []).map((r) => <SelectItem key={`r${r.id}`} value={`recurso:${r.id}`}>{r.nome} (equipamento · {r.quantidadeTotal} un.)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {tipoAlvo === "recurso" && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Quantas unidades?</label>
                <Input type="number" inputMode="numeric" min={1} max={recursoSel?.quantidadeTotal} placeholder={`Vazio = todas (${recursoSel?.quantidadeTotal ?? "—"})`} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                <p className="text-xs text-muted-foreground">Só essas unidades saem do saldo; o resto continua disponível para reserva.</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Motivo</label>
                <Select value={motivo} onValueChange={(v) => setMotivo(v as typeof motivo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="limpeza">Limpeza</SelectItem>
                    <SelectItem value="outro">Outro motivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">{motivo === "outro" ? "Descreva o motivo" : "Observação (opcional)"}</label>
                <Input value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} placeholder={motivo === "outro" ? "Ex.: Evento da escola" : "Ex.: Troca do ar-condicionado"} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">De</label>
                <Input type="date" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); if (dataFim < e.target.value) setDataFim(e.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Até</label>
                <Input type="date" value={dataFim} min={dataInicio} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Período</label>
              <Select value={turno} onValueChange={setTurno}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os períodos</SelectItem>
                  <SelectItem value="matutino">Manhã</SelectItem>
                  <SelectItem value="vespertino">Tarde</SelectItem>
                  <SelectItem value="noturno">Noite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Aulas</label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setDiaInteiro(true)} className={`rounded-lg border px-3 py-1.5 text-sm ${diaInteiro ? "border-[#1565C0] bg-[#1565C0] text-white" : "hover:bg-muted"}`}>Dia inteiro</button>
                <button type="button" onClick={() => setDiaInteiro(false)} className={`rounded-lg border px-3 py-1.5 text-sm ${!diaInteiro ? "border-[#1565C0] bg-[#1565C0] text-white" : "hover:bg-muted"}`}>Só algumas aulas</button>
              </div>
              {!diaInteiro && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" onClick={() => setAulas((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n].sort((a, b) => a - b)))} className={`h-9 w-11 rounded-md border text-sm ${aulas.includes(n) ? "border-[#1565C0] bg-[#1565C0]/10 ring-2 ring-[#1565C0]" : "hover:bg-muted"}`}>{n}ª</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" className="flex-1" disabled={enviando} onClick={() => void criar()}>
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />} Bloquear
              </Button>
              <Button type="button" variant="outline" onClick={() => { setNovo(false); limpar(); }}>Voltar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
