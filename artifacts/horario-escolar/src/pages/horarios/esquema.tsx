import { useState } from "react";
import {
  useListHorarioSlots, useSetHorarioSlotsLote, getListHorarioSlotsQueryKey,
  useListAulasFixas, useCriarAulaFixa, getListAulasFixasQueryKey,
  useListTurmas, useListDisciplinas, useListProfessores,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ArrowRight, ArrowLeft, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type Turno = "matutino" | "vespertino" | "noturno";

export default function HorarioEsquemaPage() {
  const [turno, setTurno] = useState<Turno>("matutino");
  const [step, setStep] = useState(1);
  const [modoAvancado, setModoAvancado] = useState(false);
  const [form, setForm] = useState({
    qtdAulas: 6,
    duracao: 50,
    horaInicio: "07:30",
    intervaloApos: 3,
    duracaoIntervalo: 20,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: slotsExistentes, isLoading } = useListHorarioSlots(
    { turno },
    { query: { queryKey: getListHorarioSlotsQueryKey({ turno }) } },
  );
  const salvarLote = useSetHorarioSlotsLote();

  // Prévia calculada em tempo real, igual ao protótipo — só passa a
  // gravar de verdade quando o passo final é confirmado.
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
      { data: { turno, slots: slotsPreview } },
      {
        onSuccess: () => {
          toast({ title: "Esquema salvo!", description: `${slotsPreview.length} aulas configuradas para o turno ${turno}.` });
          queryClient.invalidateQueries({ queryKey: getListHorarioSlotsQueryKey({ turno }) });
        },
        onError: () => {
          toast({ title: "Erro ao salvar esquema", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Horário / Esquema de aulas</h1>
        <p className="text-muted-foreground">Configure a base de horários de cada turno.</p>
      </div>

      <div className="flex gap-2">
        {(["matutino", "vespertino", "noturno"] as Turno[]).map((t) => (
          <Button key={t} variant={turno === t ? "default" : "outline"} size="sm" onClick={() => { setTurno(t); setStep(1); }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

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

// Modo avançado: UI de aulas_fixas — trava manual antes do gerador rodar.
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
