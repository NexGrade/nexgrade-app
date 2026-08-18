import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Info,
  Loader2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import {
  getListRegrasReservaProfessoresQueryKey,
  useListRegrasReservaProfessores,
  useUpdateRegraReservaProfessor,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function priorityLabel(priority: number) {
  return priority === 5 ? "Prioridade máxima" : priority === 4 ? "Prioridade alta" : priority === 3 ? "Prioridade média" : priority === 2 ? "Prioridade baixa" : "Prioridade mínima";
}

function priorityColor(priority: number) {
  return priority >= 4 ? "bg-[#d07b54]" : priority === 3 ? "bg-accent" : "bg-[#77ad93]";
}

function RuleRow({
  rule,
  onSaved,
}: {
  rule: { professorId: number; professorNome: string; limiteSemanal: number; prioridade: number; reservasNaSemana: number; regraId?: number | null };
  onSaved: () => void;
}) {
  const [limit, setLimit] = useState(String(rule.limiteSemanal));
  const [priority, setPriority] = useState(String(rule.prioridade));
  const [changed, setChanged] = useState(false);
  const mutation = useUpdateRegraReservaProfessor();
  const { toast } = useToast();

  useEffect(() => {
    setLimit(String(rule.limiteSemanal));
    setPriority(String(rule.prioridade));
    setChanged(false);
  }, [rule.limiteSemanal, rule.prioridade]);

  const save = () => {
    const nextLimit = Number(limit);
    const nextPriority = Number(priority);
    if (!Number.isFinite(nextLimit) || nextLimit < 0 || !Number.isFinite(nextPriority) || nextPriority < 1 || nextPriority > 5) {
      toast({ title: "Revise os valores", description: "O limite deve ser zero ou maior e a prioridade vai de 1 a 5.", variant: "destructive" });
      return;
    }
    mutation.mutate({ professorId: rule.professorId, data: { limiteSemanal: nextLimit, prioridade: nextPriority } }, {
      onSuccess: () => {
        setChanged(false);
        onSaved();
        toast({ title: "Regra salva", description: `A política de ${rule.professorNome} foi atualizada.` });
      },
      onError: () => toast({ title: "Não foi possível salvar", description: "Tente novamente em alguns instantes.", variant: "destructive" }),
    });
  };

  const usage = rule.limiteSemanal === 0 ? 0 : Math.min(100, Math.round((rule.reservasNaSemana / rule.limiteSemanal) * 100));
  const overLimit = rule.limiteSemanal > 0 && rule.reservasNaSemana > rule.limiteSemanal;

  return (
    <div data-testid={`row-reservation-rule-${rule.professorId}`} className="grid gap-4 border-t border-border px-5 py-5 first:border-t-0 lg:grid-cols-[minmax(220px,1.4fr)_180px_220px_120px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4f3ea] font-heading text-sm font-bold text-primary">{initials(rule.professorNome)}</div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground" data-testid={`text-rule-teacher-${rule.professorId}`}>{rule.professorNome}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{rule.reservasNaSemana} reserva{rule.reservasNaSemana === 1 ? "" : "s"} nesta semana</p>
          <div className="mt-2 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full transition-[width] ${overLimit ? "bg-destructive" : priorityColor(rule.prioridade)}`} style={{ width: `${usage}%` }} />
          </div>
        </div>
      </div>
      <div>
        <label htmlFor={`limit-${rule.professorId}`} className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Limite semanal</label>
        <div className="flex items-center gap-2">
          <Input
            id={`limit-${rule.professorId}`}
            data-testid={`input-rule-limit-${rule.professorId}`}
            type="number"
            min={0}
            max={30}
            value={limit}
            onChange={(event) => { setLimit(event.target.value); setChanged(true); }}
            className="h-9 w-20 bg-background"
          />
          <span className="text-xs text-muted-foreground">reservas</span>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prioridade na fila</label>
        <Select value={priority} onValueChange={(value) => { setPriority(value); setChanged(true); }}>
          <SelectTrigger data-testid={`select-rule-priority-${rule.professorId}`} className="h-9 bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[5, 4, 3, 2, 1].map((value) => <SelectItem key={value} value={String(value)}>{value} · {priorityLabel(value)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-start lg:justify-end">
        <Button data-testid={`button-save-rule-${rule.professorId}`} size="sm" variant={changed ? "default" : "ghost"} onClick={save} disabled={mutation.isPending || !changed}>
          {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : changed ? <Save className="mr-1.5 h-3.5 w-3.5" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
          {mutation.isPending ? "Salvando" : changed ? "Salvar" : "Salvo"}
        </Button>
      </div>
    </div>
  );
}

export default function RegrasReservaPage() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading, isError, refetch } = useListRegrasReservaProfessores({
    query: { queryKey: getListRegrasReservaProfessoresQueryKey() },
  });
  const { toast } = useToast();

  const sortedRules = (rules ?? []).slice().sort((a, b) => b.reservasNaSemana - a.reservasNaSemana || a.professorNome.localeCompare(b.professorNome));
  const totalReserved = sortedRules.reduce((total, rule) => total + rule.reservasNaSemana, 0);
  const totalCapacity = sortedRules.reduce((total, rule) => total + rule.limiteSemanal, 0);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: getListRegrasReservaProfessoresQueryKey() });
  };

  return (
    <div className="animate-rise-in space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/reservas" data-testid="link-back-reservations" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary hover:text-primary/80">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para reservas
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground"><SlidersHorizontal className="h-5 w-5" /></div>
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Regras de reserva</h1>
              <p className="mt-1 text-sm text-muted-foreground">Defina quanto cada professor pode solicitar e como a fila deve decidir.</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#ead58b] bg-[#fff7d7] px-4 py-3 text-xs leading-relaxed text-[#796116] sm:max-w-[240px]">
          <Info className="mr-1.5 inline h-3.5 w-3.5" />
          Prioridade 5 é atendida antes da prioridade 1 quando o mesmo espaço é disputado.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="bg-primary text-primary-foreground shadow-[0_12px_30px_hsl(169_54%_34%/_.18)]">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/70">Professores configurados</p>
            <p className="mt-2 font-heading text-3xl font-bold">{isLoading ? "—" : sortedRules.length}</p>
            <p className="mt-1 text-xs text-primary-foreground/70">com política própria</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Reservas em uso</p>
            <p className="mt-2 font-heading text-3xl font-bold">{isLoading ? "—" : totalReserved}</p>
            <p className="mt-1 text-xs text-muted-foreground">de {totalCapacity} permitidas na semana</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Critério ativo</p>
            <p className="mt-2 font-heading text-xl font-bold">Prioridade + limite</p>
            <p className="mt-1 text-xs text-muted-foreground">aplicados no momento da solicitação</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border bg-card shadow-[0_8px_30px_hsl(174_29%_14%/_.035)]">
        <CardHeader className="border-b border-border bg-secondary/40 px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <UsersRound className="h-4 w-4 text-primary" /> Política por professor
          </CardTitle>
          <p className="text-xs text-muted-foreground">O contador considera reservas pendentes e confirmadas da semana atual.</p>
        </CardHeader>
        {isError ? (
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Info className="h-7 w-7 text-destructive" />
            <p className="font-semibold">Não foi possível carregar as regras.</p>
            <Button data-testid="button-retry-rules" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
          </CardContent>
        ) : isLoading ? (
          <div className="space-y-5 p-5">
            {[1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-16 w-full" />)}
          </div>
        ) : sortedRules.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-2xl bg-secondary p-4 text-primary"><UsersRound className="h-7 w-7" /></div>
            <p className="font-heading text-xl font-bold">Nenhuma regra disponível</p>
            <p className="max-w-md text-sm text-muted-foreground">Cadastre professores ativos para configurar a política de reservas.</p>
          </CardContent>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(220px,1.4fr)_180px_220px_120px] gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground lg:grid">
              <span>Professor</span><span>Limite semanal</span><span>Prioridade</span><span className="text-right">Ação</span>
            </div>
            {sortedRules.map((rule) => <RuleRow key={rule.professorId} rule={rule} onSaved={onSaved} />)}
          </div>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-[#d4e6dc] bg-[#f1f8f3] p-4 text-sm text-[#2d6a4f]">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="font-semibold">Uma regra simples para uma semana previsível</p><p className="mt-1 text-xs leading-relaxed text-[#467d63]">Limites evitam que um único professor concentre os espaços. A prioridade ajuda a coordenação a decidir com transparência quando a demanda ultrapassa a capacidade.</p></div>
      </div>
    </div>
  );
}