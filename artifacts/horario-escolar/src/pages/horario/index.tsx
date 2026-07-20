import { useState, useEffect } from "react";
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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  CheckCircle2, RefreshCw, ChevronUp, ArrowUpCircle, Trash2, Clock, Info,
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

export default function HorarioHubPage() {
  const [aba, setAba] = useState<AbaKey>("esquema");

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

// ══════════════════════════════ ABA: ESQUEMA ══════════════════════════════

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

  // [FIX] Antes, trocar de turno/nível só ajustava `qtdAulas` (5 ou 6)
  // pro padrão -- o resto do formulário (horário de início, duração,
  // intervalo) ficava com o que já estava digitado na tela, mesmo que
  // aquele turno já tivesse um esquema DIFERENTE salvo de verdade no
  // banco. Isso fazia, por exemplo, trocar pra "Vespertino" continuar
  // mostrando "07:30" mesmo a tarde já estando configurada com 13:05 --
  // e clicar Salvar ali sobrescreveria o esquema certo com um errado.
  // Agora, quando já existe esquema salvo pro turno/nível selecionado,
  // o formulário é populado a partir dos dados reais (incluindo
  // detectar o intervalo a partir do "salto" de horário entre aulas).
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
      // Turno/nível sem esquema salvo ainda -- volta pro padrão
      // sensato (5 aulas, ou 6 se for matutino Médio/Técnico), em vez
      // de manter o que tinha ficado digitado de outro turno.
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

// ══════════════════════════════ ABA: REGRAS ══════════════════════════════

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

// ══════════════════════════════ ABA: GRADE ══════════════════════════════

function AbaGrade() {
  const [turmaId, setTurmaId] = useState<string>("all");
  const [professorId, setProfessorId] = useState<string>("all");
  // [NOVO] Filtro por turno -- também usado pra restringir a lista de
  // turmas do outro filtro (evita rolar por 53 turmas de todo turno
  // pra achar uma só da noite, por exemplo).
  const [turno, setTurno] = useState<string>("all");
  const [gerando, setGerando] = useState(false);

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

  // [FIX] O filtro de Turno antes só restringia a lista de turmas do
  // dropdown -- não filtrava as AULAS de verdade. Quando um professor
  // dá aula em mais de um turno, `numeroAula` se repete (aula 1 é
  // 07:30 de manhã E 13:05 à tarde), então a grade mostrava tudo
  // misturado, uma turno "vencendo" o outro na mesma célula. Agora
  // filtra de verdade pelo turno escolhido antes de montar a grade.
  const horarios = horariosBrutos?.filter((s) => turno === "all" || s.turma?.turno === turno);

  // Turnos que aparecem nos resultados sem filtro de turno -- usado só
  // pra decidir se precisa avisar o usuário pra escolher um turno
  // específico (ver aviso abaixo).
  const turnosNosResultados = [...new Set((horariosBrutos ?? []).map((s) => s.turma?.turno).filter(Boolean))];
  const precisaEscolherTurno = turno === "all" && professorId !== "all" && turnosNosResultados.length > 1;

  const getSlot = (diaSemana: number, numeroAula: number, turmaFilterId?: number) => {
    return horarios?.find((s) =>
      s.diaSemana === diaSemana &&
      s.numeroAula === numeroAula &&
      (!turmaFilterId || s.turmaId === turmaFilterId),
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

  // [NOVO] Gera a grade oficial (não experimental) da turma selecionada.
  // Só faz sentido com UMA turma escolhida (o algoritmo é por turma).
  // Sempre confirma antes, porque com `substituir: true` apaga a grade
  // atual daquela turma pra recolocar do zero.
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
          {/* [NOVO] Só habilita gerar com UMA turma escolhida -- o
              algoritmo (gerarAlgoritmo em routes/horarios.ts) opera
              sempre por turma, não por professor nem pra escola toda. */}
          <Button onClick={handleGerarGrade} disabled={!isTurmaSelected || gerando}>
            <RefreshCw className={`w-4 h-4 mr-2 ${gerando ? "animate-spin" : ""}`} />
            {gerando ? "Gerando..." : "Gerar Grade"}
          </Button>
        </CardContent>
      </Card>
      {!isTurmaSelected && (
        <p className="text-xs text-muted-foreground -mt-2">
          Selecione uma turma específica pra habilitar o botão "Gerar Grade" (a geração é sempre por turma).
        </p>
      )}
      {precisaEscolherTurno && (
        <p className="text-xs text-amber-600 -mt-2 font-medium">
          Este professor dá aula em mais de um turno ({turnosNosResultados.map((t) => TURNO_ROTULO_AVISO[t as string] ?? t).join(", ")}) — selecione um Turno específico acima pra ver a grade sem misturar os horários (o número da aula se repete entre turnos, ex.: aula 1 é 07:30 na manhã e 13:05 na tarde).
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-[500px] w-full" />
      ) : !isTurmaSelected && !isProfessorSelected ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p>Selecione uma turma ou professor para visualizar a grade.</p>
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
                        return (
                          <div key={`${aulaNum}-${colIndex}`} className="p-2 border-r border-border last:border-0 bg-background min-h-[100px] flex items-center justify-center">
                            <span className="text-xs text-muted-foreground/30">Vago</span>
                          </div>
                        );
                      }
                      return (
                        <div key={slot.id} className="p-2 border-r border-border last:border-0">
                          <div
                            className="h-full rounded-md p-3 flex flex-col justify-between border shadow-sm"
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
    </div>
  );
}

// ══════════════════════════════ ABA: CONFLITOS ══════════════════════════════

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
                          <Badge className={`border text-xs ${g.color}`}>{g.label}</Badge>
                          <span className="text-xs text-muted-foreground">{TIPO_LABELS[item.conflito.tipo] ?? item.conflito.tipo}</span>
                        </div>
                        <CardTitle className="text-sm font-medium mt-1">{item.conflito.descricao}</CardTitle>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0 text-xs gap-1" onClick={() => setExpanded(isOpen ? null : idx)}>
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isOpen ? "Ocultar" : "Ver sugestões"}
                    </Button>
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

// ══════════════════════════════ ABA: EXPERIMENTAL ══════════════════════════════

function AbaExperimental() {
  const { data: expSlots = [], isLoading } = useListHorariosExperimentais({});
  const { data: turmas = [] } = useListTurmas();
  const { mutateAsync: deleteExp } = useDeleteHorarioExperimental();
  const { mutateAsync: promover } = usePromoverHorarioExperimental();
  const { mutateAsync: gerar } = useGerarHorario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [openGerar, setOpenGerar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [gerarForm, setGerarForm] = useState({
    turmaId: "",
    nomeExperimental: `Experimento-${new Date().toISOString().split("T")[0]}`,
    substituir: true,
    reduzirJanelas: true,
    fatorPedagogico: false,
    compactarCargaHoraria: false,
  });

  const nomes = [...new Set(expSlots.map((s) => s.nome))];

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
    } catch {
      toast({ title: "Erro ao gerar experimento", variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  const handlePromover = async (nome: string) => {
    if (!confirm(`Promover "${nome}" para horário oficial? Isso substituirá o horário atual das turmas envolvidas.`)) return;
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
        <Button onClick={() => setOpenGerar(true)}>
          <Plus className="w-4 h-4 mr-2" />Novo Experimento
        </Button>
      </div>

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
            const turmasNome = [...new Set(slots.map((s) => turmas.find((t) => t.id === s.turmaId)?.nome ?? `Turma #${s.turmaId}`))];
            return (
              <Card key={nome} className="border-purple-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-purple-500" />
                        {nome}
                      </CardTitle>
                      <CardDescription className="mt-1">{slots.length} aulas · Turmas: {turmasNome.join(", ")}</CardDescription>
                    </div>
                    <div className="flex gap-2">
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
    </div>
  );
}
