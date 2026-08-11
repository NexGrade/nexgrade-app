import { useState, useEffect } from "react";
import { useSearch, Link } from "wouter";
import {
  useListHorarioSlots, useSetHorarioSlotsLote, getListHorarioSlotsQueryKey,
  useListAulasFixas, useCriarAulaFixa, getListAulasFixasQueryKey,
  useListTurmas, useListDisciplinas, useListProfessores,
  useGetConfiguracao, useUpsertConfiguracao, getGetConfiguracaoQueryKey,
  useGetTurma, useUpdateTurma, getGetTurmaQueryKey,
  useListLimitesDiariosProfessor, useSetLimiteDiarioProfessor, getListLimitesDiariosProfessorQueryKey,
  useListHorarios,
  useGetConflitosComSugestoes,
  useListHorariosExperimentais, useDeleteHorarioExperimental, usePromoverHorarioExperimental, useGerarHorario,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SeletorBusca } from "@/components/seletor-busca";
import {
  Check, ArrowRight, ArrowLeft, Lock, ChevronDown, ChevronRight, Plus,
  Calendar, ListChecks, AlertTriangle, FlaskConical,
  CheckCircle2, RefreshCw, ChevronUp, ArrowUpCircle, Trash2, Clock, Info, X, Sparkles,
} from "lucide-react";

// Hub único de Horário — Esquema > Regras > Grade > Conflitos > Experimental,
// unificando as antigas 5 telas separadas num fluxo em cascata só.

const ABAS = [
  { key: "esquema", label: "Esquema", icon: Clock },
  { key: "regras", label: "Regras de Distribuição", icon: ListChecks },
  { key: "grade", label: "Grade", icon: Calendar },
  { key: "conflitos", label: "Conflitos", icon: AlertTriangle },
  { key: "experimental", label: "Modo Experimental", icon: FlaskConical },
] as const;
type AbaKey = typeof ABAS[number]["key"];

type StatusCpsatResult = {
  jobStatus: "running" | "done" | "error";
  httpStatusOriginal?: number;
  totalTurmas?: number;
  totalSlots?: number;
  status?: string;
  tempoResolucaoS?: number;
  error?: string;
  mensagem?: string;
  detalhe?: string;
};

// Chave no sessionStorage para o job CP-SAT pendente (turno inteiro).
// [FIX-PERSISTENCIA] Ver comentario no topo deste arquivo/patch.
const CPSAT_JOB_PENDENTE_KEY = "nexgrade:cpsat-job-pendente";

// Chave separada pra job pendente de turma unica (Beta), pra nao
// colidir com o job de turno inteiro se os dois ficarem pendentes ao
// mesmo tempo (ex.: usuario troca de aba no meio de cada um).
const CPSAT_TURMA_JOB_PENDENTE_KEY = "nexgrade:cpsat-turma-job-pendente";

// Faz o polling resiliente de /gerar-cpsat-status/:jobId ate o job
// sair do estado "running". Extraida como funcao de modulo (nao
// depende de estado do componente) para poder ser chamada tanto pelo
// fluxo normal (handleGerarCpsat) quanto pela retomada automatica no
// useEffect de montagem.
async function pollarStatusCpsat(jobId: string): Promise<StatusCpsatResult> {
  const INTERVALO_POLLING_MS = 4000;
  // [FIX-REDE] Tolera falhas de rede transitorias (fetch failed)
  // durante o polling -- comum em redes de escola com quedas
  // intermitentes de conexao. So desiste de verdade apos varias
  // falhas consecutivas; uma unica queda de ~4s nao aborta mais a
  // geracao inteira. Um 404 "job nao encontrado" (job expirado ou de
  // outra escola) e tratado a parte, sem esperar as tentativas todas.
  const MAX_FALHAS_POLLING_CONSECUTIVAS = 5;
  let falhasPollingConsecutivas = 0;
  let statusResult: StatusCpsatResult;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_POLLING_MS));
    try {
      statusResult = await customFetch<StatusCpsatResult>(`/api/horarios/gerar-cpsat-status/${jobId}`, {
        method: "GET",
        responseType: "json",
      });
      falhasPollingConsecutivas = 0;
    } catch (pollErr) {
      const mensagemPollErr = pollErr instanceof Error ? pollErr.message : String(pollErr);
      if (mensagemPollErr.includes("encontrado")) {
        // Job expirou (>1h) ou pertence a outra escola -- nao adianta
        // insistir, e um erro terminal e nao transitorio.
        throw new Error("JOB_NAO_ENCONTRADO");
      }
      falhasPollingConsecutivas += 1;
      if (falhasPollingConsecutivas >= MAX_FALHAS_POLLING_CONSECUTIVAS) {
        throw new Error(
          `Conexao instavel: nao foi possivel consultar o progresso apos ${MAX_FALHAS_POLLING_CONSECUTIVAS} tentativas (${mensagemPollErr}). A geracao pode ainda estar rodando em segundo plano -- tente novamente em alguns instantes.`,
        );
      }
      continue;
    }
    if (statusResult.jobStatus !== "running") break;
  }
  return statusResult;
}
export default function HorarioHubPage() {
  // [NOVO] Deep-link pra uma aba específica via "?tab=..." (ex.:
  // /horario?tab=conflitos) -- usado pelos cards da Visão Geral, que
  // antes apontavam pra rotas que não existiam ("/horarios",
  // "/conflitos") e caíam em 404.
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const abaInicial = (ABAS.some((a) => a.key === tabParam) ? tabParam : "esquema") as AbaKey;
  const [aba, setAba] = useState<AbaKey>(abaInicial);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Horário</h1>
        <p className="text-muted-foreground">Configure, gere e acompanhe a grade horária da escola.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              aba === a.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <a.icon className="w-4 h-4" />
            {a.label}
          </button>
        ))}
      </div>

      {aba === "esquema" && <AbaEsquema />}
      {aba === "regras" && <AbaRegras />}
      {aba === "grade" && <AbaGrade />}
      {aba === "conflitos" && <AbaConflitos />}
      {aba === "experimental" && <AbaExperimental />}
    </div>
  );
}

// ═══════════════════════════════════════════════ ABA: ESQUEMA ═══════════════════════════════════════════════

type Turno = "matutino" | "vespertino" | "noturno";

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function AbaEsquema() {
  const [turno, setTurno] = useState<Turno>("matutino");
  const [nivelEnsino, setNivelEnsino] = useState<"fundamental" | "medio_tecnico">("fundamental");
  const [step, setStep] = useState(1);
  const [modoAvancado, setModoAvancado] = useState(false);
  const [form, setForm] = useState({
    qtdAulas: 5, // fundamental e o nivelEnsino padrao inicial (5 aulas)
    duracao: 50,
    horaInicio: "07:30",
    intervaloApos: 3,
    duracaoIntervalo: 20,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: slotsExistentes, isLoading } = useListHorarioSlots(
    { turno, nivelEnsino: turno === "matutino" ? nivelEnsino : undefined },
    { query: { queryKey: getListHorarioSlotsQueryKey({ turno, nivelEnsino: turno === "matutino" ? nivelEnsino : undefined }) } },
  );
  const salvarLote = useSetHorarioSlotsLote();

  useEffect(() => {
    if (isLoading) return;
    if (slotsExistentes && slotsExistentes.length > 0) {
      const ordenados = [...slotsExistentes].sort((a, b) => a.numeroAula - b.numeroAula);
      const primeiro = ordenados[0];
      let intervaloApos = ordenados.length;
      let duracaoIntervalo = 20;
      for (let i = 1; i < ordenados.length; i++) {
        const anterior = ordenados[i - 1];
        const atual = ordenados[i];
        const gap = paraMinutos(atual.horaInicio) - paraMinutos(anterior.horaInicio) - anterior.duracaoMinutos;
        if (gap > 0) {
          intervaloApos = i;
          duracaoIntervalo = gap;
          break;
        }
      }
      setForm({
        qtdAulas: ordenados.length,
        duracao: primeiro.duracaoMinutos,
        horaInicio: primeiro.horaInicio.slice(0, 5),
        intervaloApos,
        duracaoIntervalo,
      });
    } else {
      const qtdPadrao = turno !== "matutino" ? 5 : (nivelEnsino === "medio_tecnico" ? 6 : 5);
      const horaPadrao = turno === "matutino" ? "07:30" : turno === "vespertino" ? "13:05" : "18:45";
      setForm({ qtdAulas: qtdPadrao, duracao: 50, horaInicio: horaPadrao, intervaloApos: 3, duracaoIntervalo: 20 });
    }
  }, [turno, nivelEnsino, slotsExistentes, isLoading]);

  const slotsPreview = Array.from({ length: form.qtdAulas }, (_, i) => {
    const [h, m] = form.horaInicio.split(":").map(Number);
    let minutosTotais = h * 60 + m + i * form.duracao;
    if (i >= form.intervaloApos) minutosTotais += form.duracaoIntervalo;
    const hh = Math.floor(minutosTotais / 60).toString().padStart(2, "0");
    const mm = (minutosTotais % 60).toString().padStart(2, "0");
    return { numeroAula: i + 1, horaInicio: `${hh}:${mm}`, duracaoMinutos: form.duracao };
  });

  function salvarEsquema() {
    salvarLote.mutate(
      { data: { turno, nivelEnsino: turno === "matutino" ? nivelEnsino : undefined, slots: slotsPreview } },
      {
        onSuccess: () => {
          toast({ title: "Esquema salvo!", description: `${slotsPreview.length} aulas configuradas para o turno ${turno}.` });
          queryClient.invalidateQueries({ queryKey: getListHorarioSlotsQueryKey({ turno, nivelEnsino: turno === "matutino" ? nivelEnsino : undefined }) });
        },
        onError: () => toast({ title: "Erro ao salvar esquema", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex gap-2">
        {(["matutino", "vespertino", "noturno"] as Turno[]).map((t) => (
          <Button key={t} variant={turno === t ? "default" : "outline"} size="sm" onClick={() => { setTurno(t); setStep(1); }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>
      {turno === "matutino" && (
        <div className="flex gap-2">
          <Button variant={nivelEnsino === "fundamental" ? "default" : "outline"} size="sm" onClick={() => { setNivelEnsino("fundamental"); setStep(1); }}>
            Fundamental (6o-9o ano)
          </Button>
          <Button variant={nivelEnsino === "medio_tecnico" ? "default" : "outline"} size="sm" onClick={() => { setNivelEnsino("medio_tecnico"); setStep(1); }}>
            Medio/Tecnico (1a-3a serie)
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : modoAvancado ? (
        <AulaFixaForm turno={turno} onFechar={() => setModoAvancado(false)} />
      ) : (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-5">
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${n <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {n < step ? <Check className="h-3.5 w-3.5" /> : n}
                  </div>
                  {n < 3 && <div className={`w-10 h-0.5 ${n < step ? "bg-primary" : "bg-muted"}`} />}
                </div>
              ))}
            </div>
            <button onClick={() => setModoAvancado(true)} className="text-xs text-primary font-medium flex items-center gap-1">
              <Lock className="h-3 w-3" /> Modo avançado
            </button>
          </div>

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Horário de início</label>
                <Input type="time" value={form.horaInicio} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Quantidade de aulas</label>
                <Input type="number" min={1} max={10} value={form.qtdAulas} onChange={(e) => setForm({ ...form, qtdAulas: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Duração de cada aula (min)</label>
                <Input type="number" min={30} max={90} value={form.duracao} onChange={(e) => setForm({ ...form, duracao: Number(e.target.value) })} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Intervalo após a aula nº</label>
                  <Input type="number" min={1} max={form.qtdAulas} value={form.intervaloApos} onChange={(e) => setForm({ ...form, intervaloApos: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duração do intervalo (min)</label>
                  <Input type="number" min={5} max={40} value={form.duracaoIntervalo} onChange={(e) => setForm({ ...form, duracaoIntervalo: Number(e.target.value) })} />
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-2">Pré-visualização</p>
                <div className="flex flex-wrap gap-2">
                  {slotsPreview.map((s) => (
                    <div key={s.numeroAula} className="text-xs border rounded px-2 py-1 bg-background">
                      {s.numeroAula}ª aula · {s.horaInicio}
                    </div>
                  ))}
                </div>
              </div>
              {slotsExistentes && slotsExistentes.length > 0 && (
                <p className="text-xs text-amber-600">
                  Este turno já tem {slotsExistentes.length} slot(s) configurado(s). Salvar substitui o esquema inteiro.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <strong>{form.qtdAulas} aulas</strong> de <strong>{form.duracao}min</strong> no turno <strong>{turno}</strong>, começando às <strong>{form.horaInicio}</strong>.
            </div>
          )}

          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} className={step === 1 ? "invisible" : ""}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>Continuar <ArrowRight className="h-4 w-4 ml-1" /></Button>
            ) : (
              <Button onClick={salvarEsquema} disabled={salvarLote.isPending}>
                <Check className="h-4 w-4 mr-1" /> {salvarLote.isPending ? "Salvando..." : "Salvar esquema"}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function AulaFixaForm({ turno, onFechar }: { turno: Turno; onFechar: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [turmaId, setTurmaId] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [professorId, setProfessorId] = useState("");
  const [diaSemana, setDiaSemana] = useState("0");
  const [numeroAula, setNumeroAula] = useState("1");

  const { data: turmas } = useListTurmas();
  const { data: disciplinas } = useListDisciplinas();
  const { data: professores } = useListProfessores();
  const { data: aulasFixas } = useListAulasFixas(
    turmaId ? { turmaId: Number(turmaId) } : undefined,
    { query: { queryKey: getListAulasFixasQueryKey(turmaId ? { turmaId: Number(turmaId) } : undefined), enabled: !!turmaId } },
  );
  const criar = useCriarAulaFixa();

  const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

  function salvar() {
    if (!turmaId || !disciplinaId || !professorId) return;
    criar.mutate(
      {
        data: {
          turmaId: Number(turmaId),
          disciplinaId: Number(disciplinaId),
          professorId: Number(professorId),
          diaSemana: Number(diaSemana),
          numeroAula: Number(numeroAula),
          anoLetivo: new Date().getFullYear(),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Aula fixa criada!" });
          queryClient.invalidateQueries({ queryKey: getListAulasFixasQueryKey({ turmaId: Number(turmaId) }) });
        },
        onError: (err) => {
          toast({ title: "Erro ao criar aula fixa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        },
      },
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Travar aula manualmente</h3>
        </div>
        <button onClick={onFechar} className="text-xs text-muted-foreground">Fechar</button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Define uma aula fixa antes do gerador rodar. Útil para professores com disponibilidade muito restrita.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Select value={turmaId} onValueChange={setTurmaId}>
          <SelectTrigger><SelectValue placeholder="Turma" /></SelectTrigger>
          <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={disciplinaId} onValueChange={setDisciplinaId}>
          <SelectTrigger><SelectValue placeholder="Disciplina" /></SelectTrigger>
          <SelectContent>{disciplinas?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={professorId} onValueChange={setProfessorId}>
          <SelectTrigger><SelectValue placeholder="Professor" /></SelectTrigger>
          <SelectContent>{professores?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={diaSemana} onValueChange={setDiaSemana}>
          <SelectTrigger><SelectValue placeholder="Dia" /></SelectTrigger>
          <SelectContent>{diasSemana.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button onClick={salvar} disabled={criar.isPending || !turmaId || !disciplinaId || !professorId}>
        <Check className="h-4 w-4 mr-1" /> {criar.isPending ? "Salvando..." : "Salvar aula fixa"}
      </Button>

      {aulasFixas && aulasFixas.length > 0 && (
        <div className="mt-5 pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Aulas fixas desta turma</p>
          <div className="space-y-1">
            {aulasFixas.map((a) => (
              <div key={a.id} className="text-xs bg-muted/50 rounded px-2 py-1.5">
                {diasSemana[a.diaSemana]} · {a.numeroAula}ª aula
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════ ABA: REGRAS ═══════════════════════════════════════════════

const CHAVE_MAX_GEMINADAS = "seed_pr.max_aulas_geminadas_padrao";

function AbaRegras() {
  const [aberto, setAberto] = useState<"geral" | "especifico" | "complementar" | null>("geral");

  const secoes = [
    { key: "geral" as const, titulo: "Tipos gerais", subtitulo: "Regra padrão para toda a escola" },
    { key: "especifico" as const, titulo: "Tipos específicos", subtitulo: "Por disciplina/turma — sobrescreve o geral" },
    { key: "complementar" as const, titulo: "Complementares", subtitulo: "Professor com múltiplas disciplinas na mesma turma" },
  ];

  return (
    <div className="space-y-3 pt-2">
      {secoes.map((s, i) => {
        const isOpen = aberto === s.key;
        return (
          <Card key={s.key} className="overflow-hidden">
            <button
              onClick={() => setAberto(isOpen ? null : s.key)}
              className={`w-full flex justify-between items-center px-5 py-4 text-left ${isOpen ? "bg-muted/30" : ""}`}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <div className="font-semibold">{i + 1}. {s.titulo}</div>
                  <div className="text-xs text-muted-foreground">{s.subtitulo}</div>
                </div>
              </div>
            </button>
            {isOpen && (
              <div className="px-5 pb-5">
                {s.key === "geral" && <SecaoGeral />}
                {s.key === "especifico" && <SecaoEspecifico />}
                {s.key === "complementar" && <SecaoComplementar />}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function SecaoGeral() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetConfiguracao(CHAVE_MAX_GEMINADAS, {
    query: { queryKey: getGetConfiguracaoQueryKey(CHAVE_MAX_GEMINADAS), retry: false },
  });
  const [valor, setValor] = useState("2");
  const salvar = useUpsertConfiguracao();

  const valorAtual = typeof config?.valor === "number" ? config.valor : Number(valor);

  function salvarValor() {
    salvar.mutate(
      { chave: CHAVE_MAX_GEMINADAS, data: { valor: Number(valor), descricao: "Máximo de aulas geminadas por padrão, quando a disciplina/turma não tem override específico." } },
      {
        onSuccess: () => {
          toast({ title: "Padrão salvo!" });
          queryClient.invalidateQueries({ queryKey: getGetConfiguracaoQueryKey(CHAVE_MAX_GEMINADAS) });
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  const CHAVE_MAX_COMPLEMENTAR = "seed_pr.max_aulas_complementar_padrao";
  const { data: configComplementar, isLoading: isLoadingComplementar } = useGetConfiguracao(CHAVE_MAX_COMPLEMENTAR, {
    query: { queryKey: getGetConfiguracaoQueryKey(CHAVE_MAX_COMPLEMENTAR), retry: false },
  });
  const [valorComplementar, setValorComplementar] = useState("");
  const salvarComplementar = useUpsertConfiguracao();

  const valorComplementarAtual = typeof configComplementar?.valor === "number" ? configComplementar.valor : (valorComplementar ? Number(valorComplementar) : undefined);

  function salvarValorComplementar() {
    if (!valorComplementar) return;
    salvarComplementar.mutate(
      { chave: CHAVE_MAX_COMPLEMENTAR, data: { valor: Number(valorComplementar), descricao: "Máximo de aulas por dia com a mesma turma, por padrão, quando um professor dá mais de uma disciplina pra ela e não tem regra específica na seção Complementares." } },
      {
        onSuccess: () => {
          toast({ title: "Padrão salvo!" });
          queryClient.invalidateQueries({ queryKey: getGetConfiguracaoQueryKey(CHAVE_MAX_COMPLEMENTAR) });
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="pt-2">
      <div className="bg-muted/50 rounded-lg p-4">
        <label className="text-sm font-medium block mb-1">Máximo de aulas geminadas (padrão da escola)</label>
        <p className="text-xs text-muted-foreground mb-3">
          Vale para toda disciplina/turma que não tiver um limite específico configurado na seção abaixo.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={6}
            defaultValue={isLoading ? undefined : valorAtual}
            onChange={(e) => setValor(e.target.value)}
            className="w-24"
          />
          <Button size="sm" onClick={salvarValor} disabled={salvar.isPending}>
            <Check className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 mt-3">
        <label className="text-sm font-medium block mb-1">Máximo de aulas por dia com a mesma turma (padrão da escola)</label>
        <p className="text-xs text-muted-foreground mb-3">
          Vale pra qualquer professor que dê mais de uma disciplina numa turma e não tenha uma regra específica configurada na seção "Complementares" (por professor, ou por professor+turma). Deixe em branco pra não aplicar limite nenhum por padrão.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={6}
            placeholder="sem limite"
            defaultValue={isLoadingComplementar ? undefined : valorComplementarAtual}
            onChange={(e) => setValorComplementar(e.target.value)}
            className="w-24"
          />
          <Button size="sm" onClick={salvarValorComplementar} disabled={salvarComplementar.isPending || !valorComplementar}>
            <Check className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>
        </div>
      </div>

      <p className="text-xs text-amber-600 mt-3">
        Compactação de carga horária e bloqueio de janelas ainda não têm um padrão configurável aqui — hoje são escolhidos a cada geração de horário, na aba de Esquema.
      </p>
    </div>
  );
}

function SecaoEspecifico() {
  const [turmaId, setTurmaId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: turmas } = useListTurmas();
  const { data: turma } = useGetTurma(Number(turmaId), { query: { enabled: !!turmaId, queryKey: getGetTurmaQueryKey(Number(turmaId)) } });
  const atualizar = useUpdateTurma();

  function salvarLimite(disciplinaId: number, valor: string) {
    const numero = Number(valor);
    if (!numero || numero < 1) return;
    atualizar.mutate(
      { id: Number(turmaId), data: { disciplinasConfig: { [disciplinaId]: { maxAulasConsecutivasDia: numero } } } },
      {
        onSuccess: () => {
          toast({ title: "Limite salvo!" });
          queryClient.invalidateQueries({ queryKey: getGetTurmaQueryKey(Number(turmaId)) });
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="pt-2 space-y-4">
      <Select value={turmaId} onValueChange={setTurmaId}>
        <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
        <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
      </Select>

      {turma?.disciplinasComCarga?.map((d) => (
        <div key={d.disciplinaId} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
          <span className="text-sm">{d.nome}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">máx. geminadas/dia:</span>
            <Input
              type="number" min={1} max={6}
              defaultValue={d.maxAulasConsecutivasDia ?? ""}
              placeholder="padrão"
              className="w-16 h-8"
              onBlur={(e) => e.target.value && salvarLimite(d.disciplinaId, e.target.value)}
            />
          </div>
        </div>
      ))}
      {turmaId && turma?.disciplinasComCarga?.length === 0 && (
        <p className="text-xs text-muted-foreground">Esta turma ainda não tem disciplinas vinculadas.</p>
      )}
    </div>
  );
}

function SecaoComplementar() {
  const [aberto, setAberto] = useState(false);
  const [professorId, setProfessorId] = useState("");
  const [turmaId, setTurmaId] = useState<string>("");
  const [maxAulas, setMaxAulas] = useState("2");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: professores } = useListProfessores();
  const { data: turmas } = useListTurmas();
  const { data: limites } = useListLimitesDiariosProfessor(undefined, { query: { queryKey: getListLimitesDiariosProfessorQueryKey() } });
  const salvar = useSetLimiteDiarioProfessor();

  function salvarLimite() {
    if (!professorId) return;
    salvar.mutate(
      { data: { professorId: Number(professorId), turmaId: turmaId ? Number(turmaId) : null, maxAulasPorDia: Number(maxAulas) } },
      {
        onSuccess: () => {
          toast({ title: "Limite salvo!" });
          queryClient.invalidateQueries({ queryKey: getListLimitesDiariosProfessorQueryKey() });
          setAberto(false);
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  function nomeProfessor(id: number) {
    return professores?.find((p) => p.id === id)?.nome ?? `#${id}`;
  }
  function nomeTurma(id: number | null | undefined) {
    if (id === null || id === undefined) return "Qualquer turma (padrão do professor)";
    return turmas?.find((t) => t.id === id)?.nome ?? `#${id}`;
  }

  return (
    <div className="pt-2 space-y-2">
      {limites?.map((l) => (
        <div key={l.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-sm">
          <span>{nomeProfessor(l.professorId)}</span>
          <span className="text-xs text-muted-foreground">{nomeTurma(l.turmaId)} · máx. {l.maxAulasPorDia}/dia</span>
        </div>
      ))}

      {!aberto ? (
        <button onClick={() => setAberto(true)} className="text-xs text-primary font-medium flex items-center gap-1 mt-2">
          <Plus className="h-3.5 w-3.5" /> Adicionar regra
        </button>
      ) : (
        <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t">
          <div className="w-48">
            <label className="text-xs text-muted-foreground block mb-1">Professor</label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger><SelectValue placeholder="Professor" /></SelectTrigger>
              <SelectContent>{professores?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <label className="text-xs text-muted-foreground block mb-1">Turma (opcional)</label>
            <Select value={turmaId} onValueChange={setTurmaId}>
              <SelectTrigger><SelectValue placeholder="Qualquer turma" /></SelectTrigger>
              <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Máx./dia</label>
            <Input type="number" min={1} value={maxAulas} onChange={(e) => setMaxAulas(e.target.value)} className="w-20" />
          </div>
          <Button size="sm" onClick={salvarLimite} disabled={salvar.isPending || !professorId}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════ ABA: GRADE ═══════════════════════════════════════════════

// [NOVO] Formulário de aula manual avulsa -- POST /api/horarios já
// existia na API (verifica slot ocupado antes de inserir, retorna 409
// se já tiver aula ali), mas não tinha nenhum jeito de chamar essa
// rota pela tela. Suporta professor de apoio opcional (co-docência),
// gravando duas linhas (uma por professor) no mesmo slot -- mesmo
// padrão que o motor gerador (gerarAlgoritmo) já usa pra isso.
// [NOVO] Dados de uma aula existente, usados pra pré-preencher o
// formulário em modo edição -- inclui os IDs das linhas atuais em
// horariosTable (uma por professor, no caso de co-docência), pra
// serem apagadas antes de gravar a versão editada.
type AulaExistente = {
  idsParaExcluir: number[];
  turmaId: number;
  disciplinaId: number;
  professorId: number;
  professorApoioId?: number;
};

function DialogAdicionarAula({
  open, onOpenChange, turmaIdFixa, diaSemanaFixo, numeroAulaFixo, aulaExistente,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  turmaIdFixa?: number;
  diaSemanaFixo?: number;
  numeroAulaFixo?: number;
  // [NOVO] Quando preenchido, o dialog abre em modo edição: campos
  // pré-carregados com a aula atual, e salvar apaga as linhas antigas
  // (idsParaExcluir) antes de criar as novas.
  aulaExistente?: AulaExistente;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: turmas } = useListTurmas();
  const { data: disciplinas } = useListDisciplinas();
  const { data: professores } = useListProfessores();

  const [turmaId, setTurmaId] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [professorId, setProfessorId] = useState("");
  const [temApoio, setTemApoio] = useState(false);
  const [professorApoioId, setProfessorApoioId] = useState("");
  const [diaSemana, setDiaSemana] = useState("0");
  const [numeroAula, setNumeroAula] = useState("1");
  const [salvando, setSalvando] = useState(false);

  const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const emEdicao = !!aulaExistente;

  // Repopula os campos fixos toda vez que o dialog abre (célula
  // clicada na grade define turma/dia/aula; o resto começa vazio --
  // ou pré-preenchido com a aula existente, em modo edição).
  useEffect(() => {
    if (!open) return;
    setTurmaId(aulaExistente ? String(aulaExistente.turmaId) : (turmaIdFixa ? String(turmaIdFixa) : ""));
    setDiaSemana(diaSemanaFixo !== undefined ? String(diaSemanaFixo) : "0");
    setNumeroAula(numeroAulaFixo !== undefined ? String(numeroAulaFixo) : "1");
    if (aulaExistente) {
      setDisciplinaId(String(aulaExistente.disciplinaId));
      setProfessorId(String(aulaExistente.professorId));
      setTemApoio(!!aulaExistente.professorApoioId);
      setProfessorApoioId(aulaExistente.professorApoioId ? String(aulaExistente.professorApoioId) : "");
    } else {
      setDisciplinaId("");
      setProfessorId("");
      setTemApoio(false);
      setProfessorApoioId("");
    }
  }, [open, turmaIdFixa, diaSemanaFixo, numeroAulaFixo, aulaExistente]);

  async function salvar() {
    if (!turmaId || !disciplinaId || !professorId) {
      toast({ title: "Preencha turma, disciplina e professor", variant: "destructive" });
      return;
    }
    if (temApoio && !professorApoioId) {
      toast({ title: "Selecione o professor de apoio, ou desative a opção de co-docência", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      // [NOVO] Em modo edição, apaga as linhas antigas primeiro. Se a
      // criação da nova falhar depois (ex.: 409 por algum motivo), o
      // slot fica vazio em vez de duplicado -- pior cenário aceitável
      // aqui é "sumiu, refaça", nunca "ficou com dado duplicado".
      if (emEdicao) {
        for (const id of aulaExistente!.idsParaExcluir) {
          await customFetch(`/api/horarios/${id}`, { method: "DELETE" });
        }
      }
      const base = {
        turmaId: Number(turmaId),
        disciplinaId: Number(disciplinaId),
        diaSemana: Number(diaSemana),
        numeroAula: Number(numeroAula),
      };
      await customFetch("/api/horarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, professorId: Number(professorId) }),
        responseType: "json",
      });
      if (temApoio) {
        await customFetch("/api/horarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, professorId: Number(professorApoioId) }),
          responseType: "json",
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      toast({ title: emEdicao ? "Aula atualizada!" : (temApoio ? "Aula adicionada com os dois professores!" : "Aula adicionada!") });
      onOpenChange(false);
    } catch (err) {
      // 409 do backend = já existe aula nesse slot pra essa turma.
      toast({
        title: emEdicao ? "Erro ao salvar edição" : "Erro ao adicionar aula",
        description: err instanceof Error ? err.message : "Já existe uma aula nesse horário para essa turma — apague a existente antes, se quiser substituir.",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{emEdicao ? "Editar aula" : "Adicionar aula manual"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Turma *</Label>
              <Select value={turmaId} onValueChange={setTurmaId} disabled={!!turmaIdFixa || emEdicao}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Disciplina *</Label>
              <Select value={disciplinaId} onValueChange={setDisciplinaId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{disciplinas?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dia da semana *</Label>
              <Select value={diaSemana} onValueChange={setDiaSemana} disabled={diaSemanaFixo !== undefined}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{diasSemana.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número da aula *</Label>
              <Input
                type="number" min={0} max={8} value={numeroAula}
                onChange={(e) => setNumeroAula(e.target.value)}
                disabled={numeroAulaFixo !== undefined}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Professor (titular) *</Label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{professores?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between py-1 border-t pt-3">
            <div>
              <Label className="cursor-pointer">Aula com dois professores (co-docência)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Ex.: professor titular + professor de apoio/recomposição dando a mesma aula.</p>
            </div>
            <Switch checked={temApoio} onCheckedChange={setTemApoio} />
          </div>

          {temApoio && (
            <div className="space-y-1.5">
              <Label>Professor de apoio *</Label>
              <Select value={professorApoioId} onValueChange={setProfessorApoioId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{professores?.filter((p) => String(p.id) !== professorId).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Grava direto na grade oficial. Se já existir uma aula nesse exato horário pra essa turma, a inclusão é bloqueada — apague a aula existente primeiro, se for o caso.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : (emEdicao ? "Salvar edição" : "Adicionar aula")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// [NOVO] Popup leve que abre ao clicar numa célula JÁ OCUPADA da
// grade -- mostra a aula (ou as duas, se for co-docência) e oferece
// Editar/Excluir. Fica separado do DialogAdicionarAula porque a
// necessidade aqui é só "ver o que tem e decidir o que fazer", não um
// formulário completo.
function DialogDetalheAula({
  open, onOpenChange, slots, disciplinaNome, onEditar, onExcluir, excluindo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slots: Array<{ id: number; professorNome: string }>;
  disciplinaNome: string;
  onEditar: () => void;
  onExcluir: () => void;
  excluindo: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{disciplinaNome}</DialogTitle></DialogHeader>
        <div className="space-y-2 py-2">
          {slots.map((s) => (
            <div key={s.id} className="text-sm bg-muted/50 rounded px-3 py-2">{s.professorNome}</div>
          ))}
          {slots.length > 1 && (
            <p className="text-xs text-muted-foreground">Aula com co-docência — os dois professores acima dão essa aula juntos.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onExcluir} disabled={excluindo}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> {excluindo ? "Excluindo..." : (slots.length > 1 ? "Excluir aula (os dois)" : "Excluir aula")}
          </Button>
          <Button onClick={onEditar}>Editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AbaGrade() {
  const [turmaId, setTurmaId] = useState<string>("all");
  const [professorId, setProfessorId] = useState<string>("all");
  const [turno, setTurno] = useState<string>("all");
  const [gerando, setGerando] = useState(false);

  // [NOVO] Estado do dialog de aula manual -- ver DialogAdicionarAula
  // acima. `celulaClicada` guarda dia/aula quando o usuário clica numa
  // célula "Vago" da grade, pra pré-preencher o formulário.
  const [openAdicionar, setOpenAdicionar] = useState(false);
  const [celulaClicada, setCelulaClicada] = useState<{ dia: number; aula: number } | null>(null);
  const [aulaParaEditar, setAulaParaEditar] = useState<AulaExistente | undefined>(undefined);

  // [NOVO] Popup de detalhe/editar/excluir pra célula já ocupada.
  const [openDetalhe, setOpenDetalhe] = useState(false);
  const [detalheSlots, setDetalheSlots] = useState<Array<{ id: number; disciplinaId: number; professorId: number; professorNome: string }>>([]);
  const [detalheTurmaId, setDetalheTurmaId] = useState<number | undefined>(undefined);
  const [excluindo, setExcluindo] = useState(false);

  const { data: turmas } = useListTurmas();
  const { data: professores } = useListProfessores();
  const { mutateAsync: gerar } = useGerarHorario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams: any = {};
  if (turmaId !== "all") queryParams.turmaId = Number(turmaId);
  if (professorId !== "all") queryParams.professorId = Number(professorId);

  const { data: horariosBrutos, isLoading } = useListHorarios(queryParams);
  const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

  const TURNO_ROTULO_AVISO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
  const turmasDoTurno = (turmas ?? []).filter((t) => turno === "all" || t.turno === turno);

  const horarios = horariosBrutos?.filter((s) => turno === "all" || s.turma?.turno === turno);

  const turnosNosResultados = [...new Set((horariosBrutos ?? []).map((s) => s.turma?.turno).filter(Boolean))];
  const precisaEscolherTurno = turno === "all" && professorId !== "all" && turnosNosResultados.length > 1;

  const getSlot = (diaSemana: number, numeroAula: number, turmaFilterId?: number) => {
    return horarios?.find((s) =>
      s.diaSemana === diaSemana &&
      s.numeroAula === numeroAula &&
      (!turmaFilterId || s.turmaId === turmaFilterId),
    );
  };

  // [NOVO] Igual ao getSlot, mas retorna TODOS os professores desse
  // slot -- necessário pra co-docência (duas linhas em horariosTable,
  // mesma turma+dia+aula, professor_id diferente). getSlot() sozinho
  // só acha o primeiro e sempre foi assim pra exibição na grade; essa
  // versão é usada especificamente no clique da célula, pra edição e
  // exclusão saberem sobre as duas linhas.
  const getSlots = (diaSemana: number, numeroAula: number, turmaFilterId?: number) => {
    return (horarios ?? []).filter((s) =>
      s.diaSemana === diaSemana &&
      s.numeroAula === numeroAula &&
      (!turmaFilterId || s.turmaId === turmaFilterId),
    );
  };

  const professorIdSelecionado = professorId !== "all" ? Number(professorId) : undefined;
  const { data: disponibilidadeProf } = useQuery({
    queryKey: ["/api/disponibilidade", professorIdSelecionado],
    queryFn: async () =>
      // [FIX] fetch() sem token Bearer -- voltava 401, e o "HA"
      // (Hora-Atividade) simplesmente nunca aparecia destacado na
      // grade por professor. customFetch já anexa o token.
      customFetch<Array<{ diaSemana: number; horarioSlot: number; turno: string | null; horaAtividadeObrigatoria: boolean }>>(
        `/api/disponibilidade?professorId=${professorIdSelecionado}`,
        { responseType: "json" },
      ),
    enabled: professorIdSelecionado !== undefined,
  });

  const turnoEmUso = turmaId !== "all"
    ? turmas?.find((t) => String(t.id) === turmaId)?.turno
    : (turno !== "all" ? turno : turnosNosResultados[0]);

  const getHA = (diaSemana: number, numeroAula: number) => {
    if (!professorIdSelecionado || !disponibilidadeProf) return false;
    return disponibilidadeProf.some((d) =>
      d.horaAtividadeObrigatoria &&
      d.diaSemana === diaSemana &&
      d.horarioSlot === numeroAula &&
      (d.turno ?? turnoEmUso) === turnoEmUso,
    );
  };

  const getMaxAulas = () => {
    if (!horarios || horarios.length === 0) return 5;
    const max = Math.max(...horarios.map((s) => s.numeroAula));
    return Math.max(max, 5);
  };

  const numRows = getMaxAulas();
  const isTurmaSelected = turmaId !== "all";
  const isProfessorSelected = professorId !== "all";

  const handleGerarGrade = async () => {
    if (!isTurmaSelected) return;
    const nomeTurma = turmas?.find((t) => String(t.id) === turmaId)?.nome ?? turmaId;
    if (!confirm(`Gerar a grade de "${nomeTurma}"? Isso substitui a grade atual dessa turma, se já existir.`)) return;
    setGerando(true);
    try {
      const result = await gerar({
        data: {
          turmaId: Number(turmaId),
          substituir: true,
          reduzirJanelas: true,
          fatorPedagogico: false,
          compactarCargaHoraria: false,
          experimental: false,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      toast({
        title: `Grade gerada! ${result.slotsGerados} aulas criadas.`,
        description: result.conflitos.length ? `${result.conflitos.length} aviso(s) — veja a aba Conflitos.` : undefined,
      });
    } catch (err) {
      toast({ title: "Erro ao gerar grade", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  // [NOVO] Abre o dialog já com turma (se selecionada) + dia/aula da
  // célula clicada. Só faz sentido clicar numa célula vazia quando uma
  // turma específica está selecionada (senão não dá pra saber pra
  // qual turma é a aula).
  function abrirAdicionarNaCelula(dia: number, aula: number) {
    if (!isTurmaSelected) {
      toast({ title: "Selecione uma turma específica primeiro", description: "Pra adicionar aula clicando na célula, é preciso saber de qual turma é.", variant: "destructive" });
      return;
    }
    setCelulaClicada({ dia, aula });
    setOpenAdicionar(true);
  }

  function abrirAdicionarGeral() {
    setCelulaClicada(null);
    setAulaParaEditar(undefined);
    setOpenAdicionar(true);
  }

  // [FIX] Clique agora funciona nas duas visões (por turma OU por
  // professor) -- cada linha em `horarios` já carrega o próprio
  // turmaId, então não precisamos da turma estar selecionada no
  // filtro pra saber de qual turma é a aula clicada. Antes disso só
  // funcionava com turma selecionada, o que deixava a visão "por
  // professor" (provavelmente a mais usada pra ajustes pontuais) sem
  // a funcionalidade.
  function abrirDetalheNaCelula(dia: number, aula: number, turmaIdDaCelula: number) {
    const slots = getSlots(dia, aula, turmaIdDaCelula);
    if (slots.length === 0) return;
    setCelulaClicada({ dia, aula });
    setDetalheTurmaId(turmaIdDaCelula);
    setDetalheSlots(slots.map((s) => ({
      id: s.id, disciplinaId: s.disciplinaId, professorId: s.professorId,
      professorNome: s.professor?.nome ?? `Professor #${s.professorId}`,
    })));
    setOpenDetalhe(true);
  }

  function handleEditarAula() {
    setOpenDetalhe(false);
    setAulaParaEditar({
      idsParaExcluir: detalheSlots.map((s) => s.id),
      turmaId: detalheTurmaId!,
      disciplinaId: detalheSlots[0].disciplinaId,
      professorId: detalheSlots[0].professorId,
      professorApoioId: detalheSlots[1]?.professorId,
    });
    setOpenAdicionar(true);
  }

  async function handleExcluirAula() {
    const nomes = detalheSlots.map((s) => s.professorNome).join(" + ");
    if (!confirm(`Excluir esta aula (${nomes})? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      for (const s of detalheSlots) {
        await customFetch(`/api/horarios/${s.id}`, { method: "DELETE" });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      toast({ title: "Aula excluída." });
      setOpenDetalhe(false);
    } catch (err) {
      toast({ title: "Erro ao excluir aula", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
          <div className="space-y-2 w-full md:w-44">
            <Label>Filtrar por Turno</Label>
            <Select
              value={turno}
              onValueChange={(v) => {
                setTurno(v);
                if (v !== "all" && turmaId !== "all" && turmas?.find((t) => String(t.id) === turmaId)?.turno !== v) {
                  setTurmaId("all");
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Turnos</SelectItem>
                <SelectItem value="matutino">Matutino</SelectItem>
                <SelectItem value="vespertino">Vespertino</SelectItem>
                <SelectItem value="noturno">Noturno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-1 w-full">
            <Label>Filtrar por Turma</Label>
            <SeletorBusca
              options={[{ value: "all", label: "Todas as Turmas" }, ...turmasDoTurno.map((t) => ({ value: String(t.id), label: t.nome }))]}
              value={turmaId}
              onChange={(v) => { setTurmaId(v); setProfessorId("all"); }}
              placeholder="Todas as Turmas"
              buscarPlaceholder="Buscar turma..."
            />
          </div>
          <div className="space-y-2 flex-1 w-full">
            <Label>Filtrar por Professor</Label>
            <SeletorBusca
              options={[{ value: "all", label: "Todos os Professores" }, ...(professores ?? []).map((p) => ({ value: String(p.id), label: p.nome }))]}
              value={professorId}
              onChange={(v) => { setProfessorId(v); setTurmaId("all"); }}
              placeholder="Todos os Professores"
              buscarPlaceholder="Buscar professor..."
            />
          </div>
          <Button variant="outline" onClick={() => { setTurmaId("all"); setProfessorId("all"); setTurno("all"); }}>Limpar</Button>
          <Button variant="outline" onClick={abrirAdicionarGeral}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar aula manual
          </Button>
          <Button onClick={handleGerarGrade} disabled={!isTurmaSelected || gerando}>
            <RefreshCw className={`w-4 h-4 mr-2 ${gerando ? "animate-spin" : ""}`} />
            {gerando ? "Gerando..." : "Gerar Grade"}
          </Button>
        </CardContent>
      </Card>
      {!isTurmaSelected && (
        <p className="text-xs text-muted-foreground -mt-2">
          Selecione uma turma específica pra habilitar o botão "Gerar Grade" (a geração é sempre por turma) e pra poder adicionar aula manual clicando direto numa célula vazia da grade.
        </p>
      )}
      {precisaEscolherTurno && (
        <p className="text-xs text-amber-600 -mt-2 font-medium">
          Este professor dá aula em mais de um turno ({turnosNosResultados.map((t) => TURNO_ROTULO_AVISO[t as string] ?? t).join(", ")}) — selecione um Turno específico acima pra ver a grade sem misturar os horários (o número da aula se repete entre turnos, ex.: aula 1 é 07:30 na manhã e 13:05 na tarde).
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-[500px] w-full" />
      ) : !isTurmaSelected && !isProfessorSelected && turno !== "all" ? (
        // [NOVO] Visão por turno: mostra todas as turmas do turno
        // selecionado empilhadas, cada uma com a própria mini-grade
        // dia×aula -- antes só existia essa visão consolidada no PDF
        // (Exportar → Grade em PDF). Reaproveita os dados que
        // `horarios` já traz quando só o turno está filtrado (sem
        // turma/professor específico).
        turmasDoTurno.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <p>Nenhuma turma cadastrada nesse turno.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {turmasDoTurno.map((t) => {
              const slotsDaTurma = (horarios ?? []).filter((s) => s.turmaId === t.id);
              const maxAulaTurma = slotsDaTurma.length > 0 ? Math.max(...slotsDaTurma.map((s) => s.numeroAula), 5) : 5;
              // [FIX] Turno noturno tem um slot informativo em
              // numeroAula=0 (18:00, antes do início oficial às
              // 18:45) -- ver criar-slot-1800-noite.ts e
              // buscarHorariosPorAula em export.ts, que já trata isso
              // no PDF. Uma turma nunca tem AULA de verdade nesse
              // horário (é conceito de disponibilidade/HA do
              // professor, não de turma), então a linha aparece
              // sempre vazia aqui -- mas precisa aparecer, pra bater
              // com a realidade da grade impressa.
              const numerosAula = turno === "noturno"
                ? [0, ...Array.from({ length: maxAulaTurma }, (_, i) => i + 1)]
                : Array.from({ length: maxAulaTurma }, (_, i) => i + 1);
              return (
                <Card key={t.id} className="overflow-hidden">
                  <div className="py-2.5 px-4 bg-muted/40 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold">{t.nome}</span>
                    <span className="text-xs text-muted-foreground">{slotsDaTurma.length} aula(s)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-6 border-b border-border bg-muted/20">
                        <div className="p-2 text-xs font-medium text-muted-foreground text-center border-r border-border">Aula</div>
                        {diasSemana.map((dia) => (
                          <div key={dia} className="p-2 text-xs font-semibold text-center border-r border-border last:border-0">{dia}</div>
                        ))}
                      </div>
                      {numerosAula.map((aulaNum) => {
                        return (
                          <div key={aulaNum} className="grid grid-cols-6 border-b border-border last:border-0">
                            <div className="p-1.5 flex items-center justify-center text-xs font-medium text-muted-foreground border-r border-border bg-muted/10">
                              {aulaNum === 0 ? "18:00" : `${aulaNum}ª`}
                            </div>
                            {Array.from({ length: 5 }).map((_, colIndex) => {
                              const slot = slotsDaTurma.find((s) => s.diaSemana === colIndex && s.numeroAula === aulaNum);
                              if (!slot) {
                                return (
                                  <div key={`${aulaNum}-${colIndex}`} className="p-1 border-r border-border last:border-0 min-h-[46px] flex items-center justify-center">
                                    <span className="text-[10px] text-muted-foreground/30">–</span>
                                  </div>
                                );
                              }
                              return (
                                <div key={slot.id} className="p-1 border-r border-border last:border-0">
                                  <div
                                    className="h-full rounded p-1 border-l-4 text-[10px] leading-tight"
                                    style={{ backgroundColor: `${slot.disciplina?.cor}15`, borderLeftColor: slot.disciplina?.cor || "var(--primary)" }}
                                  >
                                    <div className="font-semibold truncate">{slot.disciplina?.nome}</div>
                                    <div className="text-muted-foreground truncate">{slot.professor?.nome}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : !isTurmaSelected && !isProfessorSelected ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p>Selecione uma turma, um professor, ou um Turno específico para visualizar a grade.</p>
          <p className="text-sm mt-2">({horarios?.length || 0} aulas alocadas no total)</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-6 border-b border-border bg-muted/50">
                <div className="p-4 font-medium text-muted-foreground text-center border-r border-border">Aula</div>
                {diasSemana.map((dia) => (
                  <div key={dia} className="p-4 font-semibold text-center border-r border-border last:border-0">{dia}</div>
                ))}
              </div>
              {Array.from({ length: numRows }).map((_, rowIndex) => {
                const aulaNum = rowIndex + 1;
                return (
                  <div key={aulaNum} className="grid grid-cols-6 border-b border-border last:border-0">
                    <div className="p-4 flex items-center justify-center font-medium text-muted-foreground border-r border-border bg-muted/20">
                      {aulaNum}ª Aula
                    </div>
                    {Array.from({ length: 5 }).map((_, colIndex) => {
                      const slotId = isTurmaSelected ? Number(turmaId) : undefined;
                      const slot = getSlot(colIndex, aulaNum, slotId);
                      if (!slot) {
                        const temHA = isProfessorSelected && getHA(colIndex, aulaNum);
                        return (
                          <button
                            key={`${aulaNum}-${colIndex}`}
                            type="button"
                            onClick={() => abrirAdicionarNaCelula(colIndex, aulaNum)}
                            className={`p-2 border-r border-border last:border-0 min-h-[100px] flex items-center justify-center w-full group transition-colors ${temHA ? "bg-amber-100" : "bg-background hover:bg-muted/40"}`}
                          >
                            {temHA ? (
                              <span className="text-xs font-bold text-amber-700">HA</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/30 group-hover:text-primary group-hover:font-medium flex items-center gap-1">
                                <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                Vago
                              </span>
                            )}
                          </button>
                        );
                      }
                      // [FIX] Clique habilitado sempre (não só quando
                      // turma selecionada) -- cada slot já carrega o
                      // próprio turmaId, então funciona também na
                      // visão "por professor".
                      return (
                        <div
                          key={slot.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => abrirDetalheNaCelula(colIndex, aulaNum, slot.turmaId)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") abrirDetalheNaCelula(colIndex, aulaNum, slot.turmaId); }}
                          className="p-2 border-r border-border last:border-0 cursor-pointer"
                        >
                          <div
                            className="h-full rounded-md p-3 flex flex-col justify-between border shadow-sm transition-shadow hover:shadow-md"
                            style={{
                              backgroundColor: `${slot.disciplina?.cor}15`,
                              borderColor: `${slot.disciplina?.cor}30`,
                              borderLeftWidth: "4px",
                              borderLeftColor: slot.disciplina?.cor || "var(--primary)",
                            }}
                          >
                            <div className="font-bold text-sm leading-tight" style={{ color: slot.disciplina?.cor ? `${slot.disciplina.cor}dd` : "inherit" }}>
                              {slot.disciplina?.nome}
                            </div>
                            <div className="mt-2 flex flex-col gap-1 text-xs">
                              {isProfessorSelected ? (
                                <span className="font-medium truncate text-foreground/80">Turma: {slot.turma?.nome}</span>
                              ) : (
                                <span className="font-medium truncate text-foreground/80">{slot.professor?.nome}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <DialogAdicionarAula
        open={openAdicionar}
        onOpenChange={(v) => { setOpenAdicionar(v); if (!v) setAulaParaEditar(undefined); }}
        turmaIdFixa={isTurmaSelected ? Number(turmaId) : undefined}
        diaSemanaFixo={celulaClicada?.dia}
        numeroAulaFixo={celulaClicada?.aula}
        aulaExistente={aulaParaEditar}
      />

      <DialogDetalheAula
        open={openDetalhe}
        onOpenChange={setOpenDetalhe}
        slots={detalheSlots}
        disciplinaNome={
          detalheSlots.length > 0
            ? (horarios?.find((h) => h.id === detalheSlots[0].id)?.disciplina?.nome ?? "Aula")
            : "Aula"
        }
        onEditar={handleEditarAula}
        onExcluir={handleExcluirAula}
        excluindo={excluindo}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════ ABA: CONFLITOS ═══════════════════════════════════════════════

const GRAVIDADE_CONFIG = {
  critico: { label: "Crítico", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
  alto: { label: "Alto", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  medio: { label: "Médio", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  baixo: { label: "Baixo", color: "bg-[#1565C0]/10 text-[#1565C0] border-[#1565C0]/20", dot: "bg-[#42A5F5]" },
};

const TIPO_LABELS: Record<string, string> = {
  professor_duplicado: "Professor Duplicado",
  carga_insuficiente: "Carga Insuficiente",
  professor_nao_habilitado: "Professor Não Habilitado",
  janelas_excessivas: "Janelas Excessivas",
  turma_sem_horario: "Turma Sem Horário",
};

function AbaConflitos() {
  const { data: conflitosComSugestoes = [], isLoading, refetch, isFetching } = useGetConflitosComSugestoes();
  const [expanded, setExpanded] = useState<number | null>(null);

  const total = conflitosComSugestoes.length;
  const criticos = conflitosComSugestoes.filter((c) => c.conflito.gravidade === "critico").length;
  const altos = conflitosComSugestoes.filter((c) => c.conflito.gravidade === "alto").length;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Reanalisar
        </Button>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <Card className={`border-border/50 ${criticos > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Total de conflitos</p>
              <p className={`text-3xl font-bold ${total > 0 ? "text-destructive" : "text-foreground"}`}>{total}</p>
            </CardContent>
          </Card>
          <Card className={`border-border/50 ${criticos > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Críticos</p>
              <p className={`text-3xl font-bold ${criticos > 0 ? "text-red-600" : "text-foreground"}`}>{criticos}</p>
            </CardContent>
          </Card>
          <Card className={`border-border/50 ${altos > 0 ? "border-orange-200 bg-orange-50/30" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Alta prioridade</p>
              <p className={`text-3xl font-bold ${altos > 0 ? "text-orange-600" : "text-foreground"}`}>{altos}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : total === 0 ? (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <p className="font-semibold text-green-700 text-lg">Nenhum conflito encontrado!</p>
            <p className="text-green-600 text-sm mt-1">A grade horária está consistente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conflitosComSugestoes.map((item, idx) => {
            const g = GRAVIDADE_CONFIG[item.conflito.gravidade as keyof typeof GRAVIDADE_CONFIG] ?? GRAVIDADE_CONFIG.baixo;
            const isOpen = expanded === idx;
            return (
              <Card key={idx} className={`border ${g.color} transition-all`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${g.dot}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`border text-xs whitespace-normal ${g.color}`}>{g.label}</Badge>
                          <span className="text-xs text-muted-foreground">{TIPO_LABELS[item.conflito.tipo] ?? item.conflito.tipo}</span>
                        </div>
                        <CardTitle className="text-sm font-medium mt-1">{item.conflito.descricao}</CardTitle>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.conflito.professorId != null && (
                        <Link href={`/disponibilidade?professorId=${item.conflito.professorId}`}>
                          <Button variant="outline" size="sm" className="text-xs gap-1">
                            Ver disponibilidade
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      )}
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setExpanded(isOpen ? null : idx)}>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isOpen ? "Ocultar" : "Ver sugestões"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0">
                    <div className="border-t border-current/20 pt-3 mt-1">
                      <p className="text-xs font-semibold mb-2 opacity-80">Sugestões de resolução:</p>
                      <ul className="space-y-1.5">
                        {item.sugestoes.map((s, si) => (
                          <li key={si} className="flex items-start gap-2 text-xs opacity-90">
                            <span className="mt-0.5 w-4 h-4 rounded-full bg-current/10 flex items-center justify-center shrink-0 font-bold text-[10px]">{si + 1}</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════ ABA: EXPERIMENTAL ═══════════════════════════════════════════════

// [NOVO] Detalhe por turma que já vinha na resposta da API
// (POST /api/horarios/gerar-lote -> `resultados`), mas não era
// exibido em lugar nenhum -- só o resumo agregado (total de turmas,
// total de conflitos) aparecia no toast. Sem isso, não dava pra saber
// QUAL disciplina ficou incompleta em QUAL turma sem ir direto no
// DevTools. Agora fica visível na própria tela, junto do card do lote.
type DetalheTurmaLote = {
  turmaId: number;
  turmaNome: string;
  slotsGerados: number;
  conflitos: string[];
  erro?: string;
};

function AbaExperimental() {
  const { data: expSlots = [], isLoading } = useListHorariosExperimentais({});
  const { data: turmas = [] } = useListTurmas();
  const { data: disciplinas = [] } = useListDisciplinas();
  const { data: professores = [] } = useListProfessores();
  const { mutateAsync: deleteExp } = useDeleteHorarioExperimental();
  const { mutateAsync: promover } = usePromoverHorarioExperimental();
  const { mutateAsync: gerar } = useGerarHorario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [openGerar, setOpenGerar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [nomeExpandido, setNomeExpandido] = useState<string | null>(null);
  const [turmaExpandidaId, setTurmaExpandidaId] = useState<number | null>(null);
  const [gerarForm, setGerarForm] = useState({
    turmaId: "",
    nomeExperimental: `Experimento-${new Date().toISOString().split("T")[0]}`,
    substituir: true,
    reduzirJanelas: true,
    fatorPedagogico: false,
    compactarCargaHoraria: false,
  });

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
    tempoLimiteS: 120,
  });
  // [NOVO] Mesmo motor CP-SAT, mas por turma única (antes só existia
  // por turno inteiro) -- espelha o par "Turma / Turno inteiro" que já
  // existe do lado do motor heurístico.
  const [openGerarCpsatTurma, setOpenGerarCpsatTurma] = useState(false);
  const [gerandoCpsatTurma, setGerandoCpsatTurma] = useState(false);
  const [cpsatTurmaForm, setCpsatTurmaForm] = useState({
    turmaId: "",
    nomeExperimental: `CPSAT-${new Date().toISOString().split("T")[0]}`,
  });
  // [NOVO] Detalhes por turma do último lote gerado -- ver comentário
  // no tipo DetalheTurmaLote acima.
  const [detalhesLote, setDetalhesLote] = useState<{ nomeExperimental: string; resultados: DetalheTurmaLote[] } | null>(null);

  const nomes = [...new Set(expSlots.map((s) => s.nome))];
  const diasSemanaExp = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

  const handleGerarLote = async () => {
    if (!loteForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do lote", variant: "destructive" }); return; }
    setGerandoLote(true);
    try {
      // [FIX] fetch() sem token Bearer -- "Gerar em Massa" voltava 401
      // antes de gerar qualquer coisa. customFetch já anexa o token.
      const result = await customFetch<{
        totalTurmas: number;
        totalSlots: number;
        totalConflitos: number;
        turmasComErro: number;
        resultados?: DetalheTurmaLote[];
      }>("/api/horarios/gerar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turno: loteForm.turno,
          nomeExperimental: loteForm.nomeExperimental,
          reduzirJanelas: loteForm.reduzirJanelas,
          fatorPedagogico: loteForm.fatorPedagogico,
          compactarCargaHoraria: loteForm.compactarCargaHoraria,
        }),
        responseType: "json",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Lote gerado! ${result.totalTurmas} turma(s), ${result.totalSlots} aulas criadas.`,
        description: result.totalConflitos > 0 || result.turmasComErro > 0
          ? `${result.totalConflitos} aviso(s) de disciplina incompleta, ${result.turmasComErro} turma(s) com erro — confira o detalhe abaixo antes de promover.`
          : undefined,
      });
      // [NOVO] Guarda o detalhe por turma (result.resultados) pra
      // exibir na tela -- antes essa informação só existia na resposta
      // da API, sem nenhum jeito de ver sem abrir o DevTools.
      setDetalhesLote({ nomeExperimental: loteForm.nomeExperimental, resultados: result.resultados ?? [] });
      setOpenGerarLote(false);
      setNomeExpandido(loteForm.nomeExperimental);
      setTurmaExpandidaId(null);
    } catch (err) {
      toast({ title: "Erro ao gerar em massa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoLote(false);
    }
  };

  // Mesma logica de finalizarJobCpsat (turno inteiro), mas pro fluxo
  // de turma unica -- reaproveita pollarStatusCpsat integralmente, so
  // muda o que acontece com o resultado (estado/toast especificos de
  // turma unica).
  const finalizarJobCpsatTurma = async (jobId: string, nomeExperimental: string, turmaId: number) => {
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
      setTurmaExpandidaId(turmaId);
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

  const handleGerarCpsatTurma = async () => {
    if (!cpsatTurmaForm.turmaId) { toast({ title: "Selecione uma turma", variant: "destructive" }); return; }
    if (!cpsatTurmaForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsatTurma(true);
    try {
      // [FIX-ASYNC-TURMA] Migrado pra rota assincrona
      // (/gerar-cpsat-async, que ja aceita turmaId), mesmo padrao do
      // turno inteiro -- evita o timeout de ~300s do proxy do Render
      // numa turma pesada e ganha de graca a resiliencia de rede e a
      // retomada automatica (useEffect abaixo) se a aba pausar no
      // meio do processo. customFetch ja anexa o token.
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turmaId: Number(cpsatTurmaForm.turmaId),
          nomeExperimental: cpsatTurmaForm.nomeExperimental,
        }),
        responseType: "json",
      });
      try {
        sessionStorage.setItem(
          CPSAT_TURMA_JOB_PENDENTE_KEY,
          JSON.stringify({
            jobId: inicio.jobId,
            nomeExperimental: cpsatTurmaForm.nomeExperimental,
            turmaId: Number(cpsatTurmaForm.turmaId),
          }),
        );
      } catch {
        // sessionStorage indisponivel -- segue sem persistencia.
      }
      await finalizarJobCpsatTurma(inicio.jobId, cpsatTurmaForm.nomeExperimental, Number(cpsatTurmaForm.turmaId));
    } catch (err) {
      // So cai aqui se o POST inicial falhar (antes de existir um
      // jobId) -- finalizarJobCpsatTurma cuida do resto.
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setGerandoCpsatTurma(false);
    }
  };

  // [FIX-PERSISTENCIA] Retomada automatica do job CP-SAT de turma
  // unica pendente -- mesma ideia do turno inteiro, chave separada.
  useEffect(() => {
    let pendente: { jobId: string; nomeExperimental: string; turmaId: number } | null = null;
    try {
      const raw = sessionStorage.getItem(CPSAT_TURMA_JOB_PENDENTE_KEY);
      if (raw) pendente = JSON.parse(raw);
    } catch {
      pendente = null;
    }
    if (!pendente?.jobId) return;
    setGerandoCpsatTurma(true);
    setOpenGerarCpsatTurma(true);
    setCpsatTurmaForm((f) => ({
      ...f,
      nomeExperimental: pendente!.nomeExperimental || f.nomeExperimental,
      turmaId: String(pendente!.turmaId),
    }));
    toast({
      title: "Retomando geracao com CP-SAT...",
      description: "A pagina foi recarregada antes do resultado chegar -- continuando de onde parou.",
    });
    void finalizarJobCpsatTurma(pendente.jobId, pendente.nomeExperimental, pendente.turmaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espera o resultado de um job CP-SAT ja em andamento (via
  // pollarStatusCpsat) e aplica o efeito colateral de sucesso/erro na
  // UI. Reaproveitada tanto pelo fluxo normal (handleGerarCpsat)
  // quanto pela retomada automatica no useEffect abaixo, para que os
  // dois caminhos tenham exatamente o mesmo comportamento final.
  const finalizarJobCpsat = async (jobId: string, nomeExperimental: string) => {
    try {
      const statusResult = await pollarStatusCpsat(jobId);
      if (statusResult.jobStatus === "error") {
        throw new Error(statusResult.mensagem || statusResult.detalhe || statusResult.error || "Erro ao gerar a grade com o motor CP-SAT.");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({
        title: `Grade CP-SAT gerada! ${statusResult.totalTurmas} turma(s), ${statusResult.totalSlots} aulas criadas.`,
        description: statusResult.status === "OPTIMAL"
          ? `Solucao otima em ${statusResult.tempoResolucaoS}s (sem janelas evitaveis).`
          : `Status: ${statusResult.status}. Confira antes de promover.`,
      });
      setOpenGerarCpsat(false);
      setNomeExpandido(nomeExperimental);
      setTurmaExpandidaId(null);
    } catch (err) {
      const mensagemErro = err instanceof Error ? err.message : String(err);
      // JOB_NAO_ENCONTRADO so acontece na retomada automatica (job
      // expirou ha mais de 1h ou pertence a outra escola) -- nao vale
      // a pena assustar o usuario com um toast vermelho por isso,
      // simplesmente encerra em silencio.
      if (mensagemErro !== "JOB_NAO_ENCONTRADO") {
        toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    } finally {
      setGerandoCpsat(false);
      try {
        sessionStorage.removeItem(CPSAT_JOB_PENDENTE_KEY);
      } catch {
        // sessionStorage indisponivel (modo privado, politica do
        // navegador etc.) -- nao ha o que fazer, apenas segue.
      }
    }
  };

  const handleGerarCpsat = async () => {
    if (!cpsatForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerandoCpsat(true);
    try {
      // [NOVO] Rota assincrona: devolve um jobId na hora (202) em vez
      // de esperar o solver terminar -- evita o timeout de ~300s do
      // proxy do Render em turnos grandes (ex.: matutino do Mario
      // Braga, 24 turmas, pode levar varios minutos). O progresso e
      // consultado via polling em /gerar-cpsat-status/:jobId ate o
      // job sair do estado "running".
      const inicio = await customFetch<{ jobId: string }>("/api/horarios/gerar-cpsat-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turno: cpsatForm.turno,
          nomeExperimental: cpsatForm.nomeExperimental,
          tempoLimiteS: cpsatForm.tempoLimiteS,
        }),
        responseType: "json",
      });
      // [FIX-PERSISTENCIA] Guarda o jobId antes de comecar o polling
      // -- se a aba for pausada/descartada pelo navegador e o React
      // remontar do zero, o useEffect de retomada abaixo encontra
      // esse registro e continua o polling sozinho, sem o usuario
      // precisar clicar em nada de novo.
      try {
        sessionStorage.setItem(
          CPSAT_JOB_PENDENTE_KEY,
          JSON.stringify({ jobId: inicio.jobId, nomeExperimental: cpsatForm.nomeExperimental }),
        );
      } catch {
        // sessionStorage indisponivel -- segue sem persistencia, como
        // era o comportamento antes deste patch.
      }
      await finalizarJobCpsat(inicio.jobId, cpsatForm.nomeExperimental);
    } catch (err) {
      // So cai aqui se a chamada POST inicial falhar (antes de existir
      // um jobId) -- finalizarJobCpsat cuida do proprio try/catch/finally
      // para tudo que acontece depois disso.
      toast({ title: "Erro ao gerar com CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setGerandoCpsat(false);
    }
  };

  // [FIX-PERSISTENCIA] Ao carregar a pagina, verifica se ha um job
  // CP-SAT pendente salvo no sessionStorage (ver handleGerarCpsat
  // acima). Se houver, retoma o polling automaticamente em vez de
  // deixar a geracao "perdida" sem nenhum aviso ao usuario.
  useEffect(() => {
    let pendente: { jobId: string; nomeExperimental: string } | null = null;
    try {
      const raw = sessionStorage.getItem(CPSAT_JOB_PENDENTE_KEY);
      if (raw) pendente = JSON.parse(raw);
    } catch {
      pendente = null;
    }
    if (!pendente?.jobId) return;
    setGerandoCpsat(true);
    setOpenGerarCpsat(true);
    setCpsatForm((f) => ({ ...f, nomeExperimental: pendente!.nomeExperimental || f.nomeExperimental }));
    toast({
      title: "Retomando geracao com CP-SAT...",
      description: "A pagina foi recarregada antes do resultado chegar -- continuando de onde parou.",
    });
    void finalizarJobCpsat(pendente.jobId, pendente.nomeExperimental);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGerar = async () => {
    if (!gerarForm.turmaId) { toast({ title: "Selecione uma turma", variant: "destructive" }); return; }
    if (!gerarForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerando(true);
    try {
      const result = await gerar({
        data: {
          turmaId: Number(gerarForm.turmaId),
          nomeExperimental: gerarForm.nomeExperimental,
          substituir: gerarForm.substituir,
          reduzirJanelas: gerarForm.reduzirJanelas,
          fatorPedagogico: gerarForm.fatorPedagogico,
          compactarCargaHoraria: gerarForm.compactarCargaHoraria,
          experimental: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({ title: `Experimento gerado! ${result.slotsGerados} aulas criadas.${result.conflitos.length ? ` ${result.conflitos.length} aviso(s).` : ""}` });
      setOpenGerar(false);
      setNomeExpandido(gerarForm.nomeExperimental);
      setTurmaExpandidaId(Number(gerarForm.turmaId));
    } catch {
      toast({ title: "Erro ao gerar experimento", variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  const handlePromover = async (nome: string) => {
    const qtdTurmas = new Set(expSlots.filter((s) => s.nome === nome).map((s) => s.turmaId)).size;
    if (!confirm(`Promover "${nome}" para horário oficial? Isso substituirá o horário atual de ${qtdTurmas} turma(s) envolvida(s).`)) return;
    try {
      await promover({ nome });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      toast({ title: `"${nome}" promovido para horário oficial!` });
    } catch {
      toast({ title: "Erro ao promover", variant: "destructive" });
    }
  };

  const handleDelete = async (nome: string) => {
    if (!confirm(`Remover o experimento "${nome}"?`)) return;
    await deleteExp({ nome });
    await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
    toast({ title: `Experimento "${nome}" removido` });
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800 flex-1 mr-4">
          <p className="font-medium mb-1">Como funciona o Modo Experimental?</p>
          <p>Gere versões alternativas de horário sem substituir a grade oficial. Compare, ajuste e quando estiver satisfeito, clique em <strong>Promover para oficial</strong> para aplicar.</p>
        </div>
        <div className="flex flex-col gap-3 shrink-0 items-stretch w-56">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Motor heurístico (rápido)</p>
            <div className="flex flex-col gap-2">
              <Button className="w-full justify-start" onClick={() => setOpenGerar(true)}>
                <Plus className="w-4 h-4 mr-2" />Turma
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setOpenGerarLote(true)}>
                <RefreshCw className="w-4 h-4 mr-2" />Turno inteiro
              </Button>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-1.5">Motor CP-SAT (preciso, mais lento)</p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full justify-start border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setOpenGerarCpsatTurma(true)}>
                <Sparkles className="w-4 h-4 mr-2" />Turma (Beta)
              </Button>
              <Button variant="outline" className="w-full justify-start border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setOpenGerarCpsat(true)}>
                <Sparkles className="w-4 h-4 mr-2" />Turno inteiro (Beta)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* [NOVO] Detalhe por turma do último lote gerado -- turmas com
          disciplina incompleta ou erro aparecem destacadas, pra dar
          exatamente a informação que faltava antes ("quais horários
          vagos e por quê") sem precisar abrir o DevTools. */}
      {detalhesLote && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Detalhe do lote "{detalhesLote.nomeExperimental}"
                </CardTitle>
                <CardDescription className="mt-1">
                  Turmas com aviso (disciplina não alocada por completo) ou erro aparecem abaixo. Turmas sem nenhuma linha aqui foram alocadas 100%.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDetalhesLote(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {detalhesLote.resultados.filter((r) => r.conflitos.length > 0 || r.erro).length === 0 ? (
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Todas as turmas foram alocadas sem avisos.
              </p>
            ) : (
              detalhesLote.resultados
                .filter((r) => r.conflitos.length > 0 || r.erro)
                .map((r) => (
                  <div key={r.turmaId} className="bg-background rounded-md border border-amber-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{r.turmaNome}</span>
                      <span className="text-xs text-muted-foreground">{r.slotsGerados} aula(s) alocada(s)</span>
                    </div>
                    {r.erro && <p className="text-xs text-destructive mt-1">{r.erro}</p>}
                    {r.conflitos.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {r.conflitos.map((c, i) => (
                          <li key={i} className="text-xs text-amber-800">• {c}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : nomes.length === 0 ? (
        <Card className="border-dashed border-purple-200">
          <CardContent className="py-16 text-center">
            <FlaskConical className="w-10 h-10 mx-auto text-purple-300 mb-3" />
            <p className="text-muted-foreground">Nenhum experimento criado ainda.</p>
            <Button className="mt-4" variant="outline" onClick={() => setOpenGerar(true)}>Criar primeiro experimento</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {nomes.map((nome) => {
            const slots = expSlots.filter((s) => s.nome === nome);
            const turmaIdsDoLote = [...new Set(slots.map((s) => s.turmaId))];
            const turmasNome = turmaIdsDoLote.map((id) => turmas.find((t) => t.id === id)?.nome ?? `Turma #${id}`);
            const ehLote = turmaIdsDoLote.length > 1;
            const slotsGrade = ehLote
              ? slots.filter((s) => s.turmaId === turmaExpandidaId)
              : slots;
            return (
              <Card key={nome} className="border-purple-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-purple-500" />
                        {nome}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {slots.length} aulas · {turmaIdsDoLote.length} turma{turmaIdsDoLote.length > 1 ? "s" : ""}
                        {turmaIdsDoLote.length <= 6 ? `: ${turmasNome.join(", ")}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline" className="gap-1.5"
                        onClick={() => {
                          if (nomeExpandido === nome) {
                            setNomeExpandido(null);
                          } else {
                            setNomeExpandido(nome);
                            setTurmaExpandidaId(ehLote ? null : turmaIdsDoLote[0] ?? null);
                          }
                        }}
                      >
                        {nomeExpandido === nome ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {nomeExpandido === nome ? "Ocultar grade" : "Ver grade"}
                      </Button>
                      <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5" onClick={() => handlePromover(nome)}>
                        <ArrowUpCircle className="w-3.5 h-3.5" />Promover para oficial
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(nome)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 5 }).map((_, dia) => {
                      const aulasNoDia = slots.filter((s) => s.diaSemana === dia).sort((a, b) => a.numeroAula - b.numeroAula);
                      if (aulasNoDia.length === 0) return null;
                      return (
                        <div key={dia} className="text-xs bg-purple-50 border border-purple-100 rounded px-2 py-1">
                          <span className="font-medium text-purple-700">{["Seg", "Ter", "Qua", "Qui", "Sex"][dia]}</span>
                          <span className="text-muted-foreground ml-1">{aulasNoDia.length} aula{aulasNoDia.length > 1 ? "s" : ""}</span>
                        </div>
                      );
                    })}
                  </div>

                  {nomeExpandido === nome && (
                    <div className="mt-4">
                      {ehLote && (
                        <div className="mb-3">
                          <Label className="text-xs mb-1.5 block">Escolha a turma pra ver a grade dela:</Label>
                          <SeletorBusca
                            options={turmaIdsDoLote.map((id) => ({ value: String(id), label: turmas.find((t) => t.id === id)?.nome ?? `Turma #${id}` }))}
                            value={turmaExpandidaId ? String(turmaExpandidaId) : ""}
                            onChange={(v) => setTurmaExpandidaId(Number(v))}
                            placeholder="Selecione a turma"
                            buscarPlaceholder="Buscar turma..."
                            className="max-w-xs"
                          />
                        </div>
                      )}
                      {(!ehLote || turmaExpandidaId) && (
                    <div className="border border-purple-100 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <div className="min-w-[700px]">
                          <div className="grid grid-cols-6 border-b border-purple-100 bg-purple-50/60">
                            <div className="p-2 text-xs font-medium text-muted-foreground text-center border-r border-purple-100">Aula</div>
                            {diasSemanaExp.map((dia) => (
                              <div key={dia} className="p-2 text-xs font-semibold text-center border-r border-purple-100 last:border-0">{dia}</div>
                            ))}
                          </div>
                          {Array.from({ length: Math.max(...slotsGrade.map((s) => s.numeroAula), 5) }).map((_, rowIndex) => {
                            const aulaNum = rowIndex + 1;
                            return (
                              <div key={aulaNum} className="grid grid-cols-6 border-b border-purple-100 last:border-0">
                                <div className="p-2 flex items-center justify-center text-xs font-medium text-muted-foreground border-r border-purple-100 bg-purple-50/30">
                                  {aulaNum}ª
                                </div>
                                {Array.from({ length: 5 }).map((_, colIndex) => {
                                  const slot = slotsGrade.find((s) => s.diaSemana === colIndex && s.numeroAula === aulaNum);
                                  if (!slot) {
                                    return (
                                      <div key={`${aulaNum}-${colIndex}`} className="p-1.5 border-r border-purple-100 last:border-0 min-h-[54px] flex items-center justify-center">
                                        <span className="text-[10px] text-muted-foreground/30">Vago</span>
                                      </div>
                                    );
                                  }
                                  const disc = disciplinas.find((d) => d.id === slot.disciplinaId);
                                  const prof = professores.find((p) => p.id === slot.professorId);
                                  return (
                                    <div key={slot.id} className="p-1 border-r border-purple-100 last:border-0">
                                      <div
                                        className="h-full rounded p-1.5 border-l-4 text-[10px] leading-tight"
                                        style={{ backgroundColor: `${disc?.cor ?? "#8E24AA"}15`, borderLeftColor: disc?.cor ?? "#8E24AA" }}
                                      >
                                        <div className="font-semibold truncate">{disc?.nome ?? "?"}</div>
                                        <div className="text-muted-foreground truncate">{prof?.nome ?? "?"}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={openGerar} onOpenChange={setOpenGerar}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Experimento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do experimento *</Label>
              <Input value={gerarForm.nomeExperimental} onChange={(e) => setGerarForm((f) => ({ ...f, nomeExperimental: e.target.value }))} placeholder="Ex: Grade-Alternativa-2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Turma *</Label>
              <Select value={gerarForm.turmaId} onValueChange={(v) => setGerarForm((f) => ({ ...f, turmaId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              A quantidade de aulas por dia e calculada automaticamente pelo esquema de horario configurado para o turno e nivel de ensino da turma selecionada.
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Reduzir janelas do professor</Label>
              <Switch checked={gerarForm.reduzirJanelas} onCheckedChange={(v) => setGerarForm((f) => ({ ...f, reduzirJanelas: v }))} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Fator pedagógico (distribuição equilibrada)</Label>
              <Switch checked={gerarForm.fatorPedagogico} onCheckedChange={(v) => setGerarForm((f) => ({ ...f, fatorPedagogico: v }))} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Compactar carga horária</Label>
              <Switch checked={gerarForm.compactarCargaHoraria} onCheckedChange={(v) => setGerarForm((f) => ({ ...f, compactarCargaHoraria: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerar(false)}>Cancelar</Button>
            <Button onClick={handleGerar} disabled={gerando}>{gerando ? "Gerando..." : "Gerar Experimento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openGerarLote} onOpenChange={setOpenGerarLote}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar em Massa</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Gera a grade de várias turmas de uma vez, como um único experimento. Nada muda na grade oficial até você conferir e clicar em "Promover para oficial". Isso limpa qualquer outro experimento em andamento antes de começar.
            </div>
            <div className="space-y-1.5">
              <Label>Nome do lote *</Label>
              <Input value={loteForm.nomeExperimental} onChange={(e) => setLoteForm((f) => ({ ...f, nomeExperimental: e.target.value }))} placeholder="Ex: Grade-Semana-2026-07-27" />
            </div>
            <div className="space-y-1.5">
              <Label>Turno</Label>
              <Select value={loteForm.turno} onValueChange={(v) => setLoteForm((f) => ({ ...f, turno: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matutino">Matutino</SelectItem>
                  <SelectItem value="vespertino">Vespertino</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A geração em massa sempre é feita por turno (mais rápido e mais seguro de conferir do que a escola inteira de uma vez).</p>
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Reduzir janelas do professor</Label>
              <Switch checked={loteForm.reduzirJanelas} onCheckedChange={(v) => setLoteForm((f) => ({ ...f, reduzirJanelas: v }))} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Fator pedagógico (distribuição equilibrada)</Label>
              <Switch checked={loteForm.fatorPedagogico} onCheckedChange={(v) => setLoteForm((f) => ({ ...f, fatorPedagogico: v }))} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Compactar carga horária</Label>
              <Switch checked={loteForm.compactarCargaHoraria} onCheckedChange={(v) => setLoteForm((f) => ({ ...f, compactarCargaHoraria: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarLote(false)}>Cancelar</Button>
            <Button onClick={handleGerarLote} disabled={gerandoLote}>{gerandoLote ? "Gerando (pode demorar)..." : "Gerar em Massa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openGerarCpsatTurma} onOpenChange={setOpenGerarCpsatTurma}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar com CP-SAT — Turma (Beta)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-md p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
              Usa o motor CP-SAT (OR-Tools) em vez do gerador heurístico -- mais preciso pra eliminar janelas na grade dos professores. Grava sempre como experimento; nada muda na grade oficial até você promover.
            </div>
            <div className="space-y-1.5">
              <Label>Nome do experimento *</Label>
              <Input value={cpsatTurmaForm.nomeExperimental} onChange={(e) => setCpsatTurmaForm((f) => ({ ...f, nomeExperimental: e.target.value }))} placeholder="Ex: CPSAT-Turma-2026-07-27" />
            </div>
            <div className="space-y-1.5">
              <Label>Turma *</Label>
              <Select value={cpsatTurmaForm.turmaId} onValueChange={(v) => setCpsatTurmaForm((f) => ({ ...f, turmaId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarCpsatTurma(false)}>Cancelar</Button>
            <Button onClick={handleGerarCpsatTurma} disabled={gerandoCpsatTurma}>{gerandoCpsatTurma ? "Gerando (pode levar até 2 min)..." : "Gerar com CP-SAT"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openGerarCpsat} onOpenChange={setOpenGerarCpsat}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar com CP-SAT — Turno inteiro (Beta)</DialogTitle></DialogHeader>
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
            <div className="space-y-1.5">
              <Label>Tempo limite (segundos)</Label>
              <Input type="number" min={30} max={600} value={cpsatForm.tempoLimiteS} onChange={(e) => setCpsatForm((f) => ({ ...f, tempoLimiteS: Number(e.target.value) || 120 }))} />
              <p className="text-xs text-muted-foreground">Padrao 120s. Turnos com muitas turmas (ex.: matutino do Mario Braga, 24 turmas) podem precisar de mais tempo -- tente 300-600s se o solver nao terminar a tempo.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerarCpsat(false)}>Cancelar</Button>
            <Button onClick={handleGerarCpsat} disabled={gerandoCpsat}>{gerandoCpsat ? "Gerando (acompanhando progresso)..." : "Gerar com CP-SAT"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
