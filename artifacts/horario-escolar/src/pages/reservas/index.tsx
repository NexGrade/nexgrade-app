import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  getGetReservasResumoQueryKey,
  getListHorariosQueryKey,
  getListRegrasReservaProfessoresQueryKey,
  getListReservasQueryKey,
  getListSalasQueryKey,
  getListProfessoresQueryKey,
  useCreateReserva,
  useDeleteReserva,
  useGetReservasResumo,
  useListHorarios,
  useListProfessores,
  useListReservas,
  useListSalas,
  useUpdateReserva,
} from "@workspace/api-client-react";
import type { Reserva } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const salaTypes: Record<string, string> = {
  sala_aula: "Sala de aula",
  laboratorio: "Laboratório",
  quadra: "Quadra",
  informatica: "Informática",
  auditorio: "Auditório",
  biblioteca: "Biblioteca",
  sala_arte: "Sala de arte",
  outro: "Outro espaço",
};

const reservaSchema = z.object({
  salaId: z.coerce.number().min(1, "Escolha um espaço"),
  professorId: z.coerce.number().min(1, "Escolha um professor"),
  data: z.string().min(1, "Escolha uma data"),
  numeroAula: z.coerce.number().min(1).max(8),
  titulo: z.string().min(2, "Informe o objetivo da reserva"),
  observacoes: z.string().optional(),
});

type ReservaFormValues = z.infer<typeof reservaSchema>;

function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayFor(date: string) {
  if (!date) return -1;
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6 ? -1 : day - 1;
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
}

function statusLabel(status: string) {
  return status === "confirmada" ? "Confirmada" : status === "cancelada" ? "Cancelada" : "Pendente";
}

function statusClass(status: string) {
  return status === "confirmada"
    ? "border-[#8dc7ae] bg-[#e4f3ea] text-[#206b4c]"
    : status === "cancelada"
      ? "border-[#e7b9b0] bg-[#fbebe7] text-[#9b4034]"
      : "border-[#ead58b] bg-[#fff7d7] text-[#796116]";
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: string;
  icon: typeof CalendarDays;
}) {
  return (
    <Card className="relative overflow-hidden border-card-border bg-card shadow-[0_8px_24px_hsl(174_29%_14%/_.04)]">
      <div className={`absolute inset-y-0 left-0 w-1 ${tone}`} />
      <CardContent className="flex items-start justify-between p-5 pl-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground" data-testid={`text-summary-${label.toLowerCase().replaceAll(" ", "-")}`}>
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-xl bg-secondary p-2.5 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function ReservationSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-4 h-6 w-72" />
          <Skeleton className="mt-3 h-4 w-56" />
        </div>
      ))}
    </div>
  );
}

function ReservationForm({
  form,
  salas,
  professores,
  editing,
  onSubmit,
  isPending,
}: {
  form: ReturnType<typeof useForm<ReservaFormValues>>;
  salas: Array<{ id: number; nome: string; tipo: string; capacidade: number; ativa: boolean }>;
  professores: Array<{ id: number; nome: string; ativo: boolean }>;
  editing: boolean;
  onSubmit: (data: ReservaFormValues) => void;
  isPending: boolean;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data da reserva</FormLabel>
                <FormControl><Input data-testid="input-reservation-date" type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="numeroAula"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Aula / horário</FormLabel>
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <FormControl><SelectTrigger data-testid="select-reservation-slot"><SelectValue placeholder="Selecione a aula" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Array.from({ length: 8 }, (_, index) => index + 1).map((slot) => (
                      <SelectItem key={slot} value={String(slot)}>Aula {slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="salaId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Espaço compartilhado</FormLabel>
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <FormControl><SelectTrigger data-testid="select-reservation-room"><SelectValue placeholder="Escolha uma sala ou espaço" /></SelectTrigger></FormControl>
                <SelectContent>
                  {salas.filter((sala) => sala.ativa).map((sala) => (
                    <SelectItem key={sala.id} value={String(sala.id)}>
                      {sala.nome} · {salaTypes[sala.tipo] ?? sala.tipo} · {sala.capacidade} lugares
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="professorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Professor responsável</FormLabel>
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <FormControl><SelectTrigger data-testid="select-reservation-teacher"><SelectValue placeholder="Quem conduzirá a atividade?" /></SelectTrigger></FormControl>
                <SelectContent>
                  {professores.filter((professor) => professor.ativo).map((professor) => (
                    <SelectItem key={professor.id} value={String(professor.id)}>{professor.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="titulo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Objetivo da reserva</FormLabel>
              <FormControl><Input data-testid="input-reservation-title" placeholder="Ex.: Avaliação de Ciências — 8º ano" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="observacoes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel>
              <FormControl><Textarea data-testid="input-reservation-notes" className="resize-none" placeholder="Equipamentos, montagem ou aviso para a equipe..." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="rounded-xl border border-[#d4e6dc] bg-[#f1f8f3] p-3 text-xs leading-relaxed text-[#2d6a4f]">
          <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
          O NexGrade verifica ocupação do espaço e o limite semanal do professor antes de registrar.
        </div>
        <Button data-testid="button-submit-reservation" type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          {isPending ? "Registrando..." : editing ? "Salvar alterações" : "Registrar reserva"}
        </Button>
      </form>
    </Form>
  );
}

export default function ReservasPage() {
  const today = localDateInput();
  const [selectedDate, setSelectedDate] = useState(today);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Reserva | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reservationsQuery = useListReservas({ data: selectedDate }, {
    query: { queryKey: getListReservasQueryKey({ data: selectedDate }) },
  });
  const summaryQuery = useGetReservasResumo({ data: selectedDate }, {
    query: { queryKey: getGetReservasResumoQueryKey({ data: selectedDate }) },
  });
  const salasQuery = useListSalas({ query: { queryKey: getListSalasQueryKey() } });
  const professoresQuery = useListProfessores({ query: { queryKey: getListProfessoresQueryKey() } });
  const horariosQuery = useListHorarios(undefined, { query: { queryKey: getListHorariosQueryKey() } });
  const createReserva = useCreateReserva();
  const updateReserva = useUpdateReserva();
  const deleteReserva = useDeleteReserva();

  const reservas = reservationsQuery.data ?? [];
  const salas = salasQuery.data ?? [];
  const professores = professoresQuery.data ?? [];
  const horarios = horariosQuery.data ?? [];
  const summary = summaryQuery.data;
  const isLoading = reservationsQuery.isLoading || salasQuery.isLoading || professoresQuery.isLoading;
  const isError = reservationsQuery.isError || summaryQuery.isError;

  const conflicts = useMemo(() => {
    const keys = new Map<string, number>();
    reservas.forEach((reserva) => {
      if (reserva.status !== "cancelada") {
        const key = `${reserva.salaId}-${reserva.numeroAula}`;
        keys.set(key, (keys.get(key) ?? 0) + 1);
      }
    });
    return new Set(Array.from(keys.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [reservas]);

  const form = useForm<ReservaFormValues>({
    resolver: zodResolver(reservaSchema),
    defaultValues: {
      salaId: 0,
      professorId: 0,
      data: selectedDate,
      numeroAula: 1,
      titulo: "",
      observacoes: "",
    },
  });

  const invalidateReservations = () => {
    queryClient.invalidateQueries({ queryKey: getListReservasQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetReservasResumoQueryKey({ data: selectedDate }) });
    queryClient.invalidateQueries({ queryKey: getListRegrasReservaProfessoresQueryKey() });
  };

  const openCreate = () => {
    setEditing(null);
    form.reset({ salaId: 0, professorId: 0, data: selectedDate, numeroAula: 1, titulo: "", observacoes: "" });
    setDialogOpen(true);
  };

  const openEdit = (reserva: (typeof reservas)[number]) => {
    setEditing(reserva);
    form.reset({
      salaId: reserva.salaId,
      professorId: reserva.professorId,
      data: reserva.data.slice(0, 10),
      numeroAula: reserva.numeroAula,
      titulo: reserva.titulo,
      observacoes: reserva.observacoes ?? "",
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: ReservaFormValues) => {
    const diaSemana = weekdayFor(data.data);
    if (diaSemana < 0) {
      toast({ title: "Escolha um dia letivo", description: "As reservas podem ser registradas de segunda a sexta.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateReserva.mutate({ id: editing.id, data: { ...data, diaSemana } }, {
        onSuccess: () => {
          invalidateReservations();
          setDialogOpen(false);
          toast({ title: "Reserva atualizada", description: "O espaço continua protegido contra conflitos." });
        },
        onError: () => toast({ title: "Não foi possível atualizar", description: "Verifique se o espaço ainda está livre.", variant: "destructive" }),
      });
    } else {
      createReserva.mutate({ data: { ...data, diaSemana } }, {
        onSuccess: () => {
          invalidateReservations();
          setDialogOpen(false);
          toast({ title: "Reserva registrada", description: "A solicitação entrou na fila de confirmação." });
        },
        onError: () => toast({ title: "Reserva não registrada", description: "Há um conflito de espaço ou limite semanal.", variant: "destructive" }),
      });
    }
  };

  const changeStatus = (id: number, status: "confirmada" | "cancelada") => {
    updateReserva.mutate({ id, data: { status } }, {
      onSuccess: () => {
        invalidateReservations();
        toast({ title: status === "confirmada" ? "Reserva confirmada" : "Reserva cancelada" });
      },
      onError: () => toast({ title: "Não foi possível atualizar o status", variant: "destructive" }),
    });
  };

  const removeReservation = (id: number) => {
    if (!window.confirm("Excluir esta reserva? Essa ação não pode ser desfeita.")) return;
    deleteReserva.mutate({ id }, {
      onSuccess: () => {
        invalidateReservations();
        toast({ title: "Reserva excluída" });
      },
      onError: () => toast({ title: "Não foi possível excluir", variant: "destructive" }),
    });
  };

  const shiftDate = (amount: number) => {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + amount);
    setSelectedDate(localDateInput(next));
  };

  const scheduleFor = (reserva: (typeof reservas)[number]) =>
    horarios.find((slot) => slot.professorId === reserva.professorId && slot.diaSemana === reserva.diaSemana && slot.numeroAula === reserva.numeroAula);

  return (
    <div className="animate-rise-in space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Operação semanal
          </div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">Reservas de espaços</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Um quadro único para proteger salas, quadras e laboratórios do improviso — sempre alinhado ao horário dos professores.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="button-reservation-rules" variant="outline" asChild>
            <Link href="/reservas/regras"><UsersRound className="mr-2 h-4 w-4" /> Regras por professor</Link>
          </Button>
          <Button data-testid="button-new-reservation" onClick={openCreate} className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> Nova reserva
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_8px_30px_hsl(174_29%_14%/_.035)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button data-testid="button-previous-day" variant="ghost" size="icon" onClick={() => shiftDate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[220px] text-center">
            <p className="font-heading text-base font-bold capitalize" data-testid="text-selected-date">{displayDate(selectedDate)}</p>
            <p className="text-xs text-muted-foreground">{days[weekdayFor(selectedDate)] ?? "Fim de semana"} · {selectedDate.slice(0, 4)}</p>
          </div>
          <Button data-testid="button-next-day" variant="ghost" size="icon" onClick={() => shiftDate(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Input data-testid="input-filter-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-9 w-auto bg-background" />
          <Button data-testid="button-today" variant="secondary" size="sm" onClick={() => setSelectedDate(today)}>Hoje</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Reservas do dia" value={summary?.total ?? "—"} detail="solicitações registradas" tone="bg-primary" icon={CalendarDays} />
        <SummaryCard label="Confirmadas" value={summary?.confirmadas ?? "—"} detail="espaços protegidos" tone="bg-[#5eaa83]" icon={ShieldCheck} />
        <SummaryCard label="Pendentes" value={summary?.pendentes ?? "—"} detail="aguardando decisão" tone="bg-accent" icon={Clock3} />
        <SummaryCard label="Salas ocupadas" value={summary?.salasOcupadas ?? "—"} detail="com pelo menos uma reserva" tone="bg-[#d07b54]" icon={DoorOpen} />
      </div>

      {isError ? (
        <Card className="border-[#e7b9b0] bg-[#fff7f4]">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-heading text-lg font-bold">Não conseguimos carregar o quadro</p>
            <p className="max-w-md text-sm text-muted-foreground">A agenda não foi alterada. Tente atualizar para buscar os dados mais recentes.</p>
            <Button data-testid="button-retry-reservations" variant="outline" onClick={() => reservationsQuery.refetch()}><RefreshCcw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <ReservationSkeleton />
      ) : reservas.length === 0 ? (
        <Card className="border-dashed border-[#b7d5c4] bg-[#f6fbf7]">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-2xl bg-[#dcefe3] p-4 text-primary"><DoorOpen className="h-7 w-7" /></div>
            <p className="font-heading text-xl font-bold">Dia livre de reservas</p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">Nenhum espaço foi solicitado para {displayDate(selectedDate)}. Registre uma reserva quando uma atividade precisar sair da sala de aula.</p>
            <Button data-testid="button-empty-new-reservation" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Registrar primeira reserva</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold">Agenda do dia</h2>
              <p className="text-xs text-muted-foreground">{reservas.length} registro{reservas.length === 1 ? "" : "s"} · ordenados por aula</p>
            </div>
            <div className="hidden items-center gap-3 text-[11px] font-medium text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#5eaa83]" /> Confirmada</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" /> Pendente</span>
            </div>
          </div>
          {reservas.slice().sort((a, b) => a.numeroAula - b.numeroAula).map((reserva) => {
            const schedule = scheduleFor(reserva);
            const roomConflict = conflicts.has(`${reserva.salaId}-${reserva.numeroAula}`);
            return (
              <Card key={reserva.id} data-testid={`card-reservation-${reserva.id}`} className={`overflow-hidden border-border bg-card transition-shadow hover:shadow-[0_10px_28px_hsl(174_29%_14%/_.07)] ${roomConflict ? "border-l-4 border-l-destructive" : "border-l-4 border-l-primary"}`}>
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                    <div className="flex min-w-[94px] items-center gap-3 lg:flex-col lg:items-start lg:gap-0">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Aula {reserva.numeroAula}</span>
                      <span className="mt-1 text-xs text-muted-foreground">{roomConflict ? "Conflito detectado" : "Slot protegido"}</span>
                    </div>
                    <div className="hidden h-12 w-px bg-border lg:block" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-heading text-lg font-bold" data-testid={`text-reservation-title-${reserva.id}`}>{reserva.titulo}</h3>
                        <Badge className={`border text-[10px] font-bold uppercase tracking-wider ${statusClass(reserva.status)}`} data-testid={`status-reservation-${reserva.id}`}>{statusLabel(reserva.status)}</Badge>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">Prioridade {reserva.prioridadeAplicada}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium text-foreground"><DoorOpen className="h-3.5 w-3.5 text-primary" /> {reserva.sala?.nome ?? "Espaço não informado"}</span>
                        <span className="flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" /> {reserva.professor?.nome ?? "Professor não informado"}</span>
                        {schedule && <span className="flex items-center gap-1.5"><ArrowRight className="h-3.5 w-3.5" /> Horário vinculado {schedule.disciplina?.nome ? `· ${schedule.disciplina.nome}` : ""}</span>}
                      </div>
                      {roomConflict && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Este espaço tem mais de uma solicitação nesta aula. Resolva antes de confirmar.</p>}
                      {reserva.observacoes && <p className="mt-2 text-xs text-muted-foreground">{reserva.observacoes}</p>}
                    </div>
                    <div className="flex items-center gap-1 border-t border-border pt-3 lg:border-0 lg:pt-0">
                      {reserva.status === "pendente" && <Button data-testid={`button-confirm-reservation-${reserva.id}`} size="sm" onClick={() => changeStatus(reserva.id, "confirmada")} disabled={updateReserva.isPending}><Check className="mr-1.5 h-3.5 w-3.5" /> Confirmar</Button>}
                      {reserva.status !== "cancelada" && <Button data-testid={`button-cancel-reservation-${reserva.id}`} size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => changeStatus(reserva.id, "cancelada")} disabled={updateReserva.isPending}><X className="h-4 w-4" /></Button>}
                      <Button data-testid={`button-edit-reservation-${reserva.id}`} size="icon" variant="ghost" onClick={() => openEdit(reserva)}><CalendarDays className="h-4 w-4" /></Button>
                      <Button data-testid={`button-delete-reservation-${reserva.id}`} size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeReservation(reserva.id)} disabled={deleteReserva.isPending}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">{editing ? "Ajustar reserva" : "Nova reserva"}</DialogTitle>
            <DialogDescription>Reserve um espaço sem perder de vista o horário do professor.</DialogDescription>
          </DialogHeader>
          <ReservationForm
            form={form}
            salas={salas}
            professores={professores}
            editing={Boolean(editing)}
            onSubmit={onSubmit}
            isPending={createReserva.isPending || updateReserva.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}