import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { UserButton } from "@clerk/react";
import {
  useGetMinhaAgendaNotificacoes,
  useMarcarMinhaNotificacaoLida,
  getGetMinhaAgendaNotificacoesQueryKey,
} from "@workspace/api-client-react";
import { NotificationBell } from "@/components/notification-bell";
import { CalendarDays, Download, Loader2, Plus, CalendarPlus, MonitorSmartphone } from "lucide-react";
import {
  useGetMeuProfessor,
  useGetMinhaAgendaHorario,
  useGetMinhaAgendaReservas,
  useCreateMinhaReserva,
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

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

const ReservaFormSchema = z.object({
  salaId: z.coerce.number().int().positive("Escolha um espaço"),
  data: z.string().min(1, "Escolha a data"),
  numeroAula: z.coerce.number().int().min(1),
  titulo: z.string().min(1, "Descreva o objetivo"),
  observacoes: z.string().optional(),
});
type ReservaFormValues = z.infer<typeof ReservaFormSchema>;

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

function gerarIcs(
  aulas: Array<{ diaSemana: number; numeroAula: number; disciplinaNome: string; turmaNome: string; sala?: string | null }>,
  reservas: Array<{ data: string; numeroAula: number; titulo: string; salaNome: string; status: string }>,
  nomeProfessor: string,
) {
  const HORAS_POR_AULA: Record<number, string> = {
    1: "0700", 2: "0750", 3: "0740", 4: "0930", 5: "1020", 6: "1110",
  };
  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NexGrade//Minha Agenda//PT",
    "CALSCALE:GREGORIAN",
  ];
  // Segunda-feira de referencia para gerar as datas das aulas recorrentes
  const hoje = new Date();
  const diaSemanaHoje = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
  const segundaRef = new Date(hoje);
  segundaRef.setDate(hoje.getDate() - diaSemanaHoje);

  aulas.forEach((aula, idx) => {
    const dataAula = new Date(segundaRef);
    dataAula.setDate(segundaRef.getDate() + aula.diaSemana);
    const yyyymmdd = dataAula.toISOString().slice(0, 10).replace(/-/g, "");
    const hora = HORAS_POR_AULA[aula.numeroAula] ?? "0800";
    linhas.push(
      "BEGIN:VEVENT",
      `UID:aula-${idx}-${nomeProfessor.replace(/\s/g, "")}@nexgrade`,
      `DTSTART:${yyyymmdd}T${hora}00`,
      `DTEND:${yyyymmdd}T${hora}50`,
      "RRULE:FREQ=WEEKLY;COUNT=20",
      `SUMMARY:${aula.disciplinaNome} - ${aula.turmaNome}`,
      `LOCATION:${aula.sala ?? ""}`,
      "END:VEVENT",
    );
  });

  reservas.forEach((r, idx) => {
    const yyyymmdd = r.data.replace(/-/g, "");
    const hora = HORAS_POR_AULA[r.numeroAula] ?? "0800";
    linhas.push(
      "BEGIN:VEVENT",
      `UID:reserva-${idx}-${nomeProfessor.replace(/\s/g, "")}@nexgrade`,
      `DTSTART:${yyyymmdd}T${hora}00`,
      `DTEND:${yyyymmdd}T${hora}50`,
      `SUMMARY:[Reserva ${r.status}] ${r.titulo}`,
      `LOCATION:${r.salaNome}`,
      "END:VEVENT",
    );
  });

  linhas.push("END:VCALENDAR");
  return linhas.join("\r\n");
}

function NovaReservaDialog({ professorId }: { professorId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: salas } = useListSalas();

  const form = useForm<ReservaFormValues>({
    resolver: zodResolver(ReservaFormSchema),
    defaultValues: { salaId: 0, data: "", numeroAula: 1, titulo: "", observacoes: "" },
  });

  const criar = useCreateMinhaReserva({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetMinhaAgendaReservasQueryKey() });
        const pendente = result.status === "pendente";
        toast({
          title: pendente ? "Solicitação enviada" : "Reserva confirmada",
          description: pendente
            ? "Sua reserva entrou na fila de aprovação da coordenação."
            : "Sua reserva foi confirmada automaticamente.",
        });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({
          title: "Não foi possível reservar",
          description: err?.response?.data?.error ?? "Verifique conflito de horário.",
          variant: "destructive",
        });
      },
    },
  });

  function onSubmit(values: ReservaFormValues) {
    criar.mutate({
      data: {
        salaId: values.salaId,
        data: values.data,
        diaSemana: diaSemanaDaData(values.data),
        numeroAula: values.numeroAula,
        titulo: values.titulo,
        observacoes: values.observacoes,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova reserva
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar reserva de espaço</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="salaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Espaço</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha o espaço" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {salas?.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.nome}
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
              name="data"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="numeroAula"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aula</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
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
                  <FormControl>
                    <Input placeholder="Ex.: Prova, Aula prática..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (opcional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={criar.isPending}>
              {criar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Solicitar reserva
            </Button>
          </form>
        </Form>
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
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

export default function MinhaAgendaPage() {
  const { podeInstalar, instalar } = usePwaInstall();
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
  const proximosEventos = useMemo(() => {
    if (!eventosCalendario) return [];
    const hoje = new Date().toISOString().slice(0, 10);
    return eventosCalendario
      .filter((e) => e.data >= hoje)
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 6);
  }, [eventosCalendario]);

  const maxAula = useMemo(() => {
    if (!aulas || aulas.length === 0) return 6;
    return Math.max(...aulas.map((a) => a.numeroAula), 6);
  }, [aulas]);
  const hojeDiaSemana = useMemo(() => {
    const dow = new Date().getDay();
    return dow === 0 ? 6 : dow - 1;
  }, []);

  function handleBaixarPdf() {
    window.print();
  }

  function handleAdicionarCalendario() {
    if (!professor) return;
    // [FIX-v2] A primeira tentativa (navegar direto pra rota da API)
    // falhou com 401 -- o Clerk trata navegacao de pagina cheia
    // (window.location.href) diferente de chamadas via fetch/XHR, e
    // nao reconhece a sessao nesse caso. Solucao: gerar o .ics no
    // proprio navegador (dado que ja carregamos aulas/reservas) e
    // navegar para uma "data URI" -- o Safari do iPhone reconhece
    // esse formato especificamente e oferece "Adicionar ao
    // Calendario" nativamente (diferente de blob + download, que ele
    // nao suporta bem).
    const ics = gerarIcs(aulas ?? [], reservas ?? [], professor.nome);
    window.location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
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
          <p className="text-sm text-muted-foreground">{professor.nome}</p>
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
        <div className="flex flex-wrap gap-2 justify-end print:hidden">
          {podeInstalar && (
            <Button variant="outline" onClick={instalar}>
              <MonitorSmartphone className="h-4 w-4 mr-2" />
              Instalar app
            </Button>
          )}
          <Button variant="outline" onClick={handleBaixarPdf}>
            <Download className="h-4 w-4 mr-2" />
            Baixar PDF
          </Button>
          <Button variant="outline" onClick={handleAdicionarCalendario}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Adicionar ao calendário
          </Button>
          <NovaReservaDialog professorId={professor.id} />
        </div>

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
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 border-b">Aula</th>
                      {DIAS.map((d, idx) => (
                        <th
                          key={d}
                          className={`text-left p-2 border-b ${
                            idx === hojeDiaSemana ? "text-primary font-semibold" : ""
                          }`}
                        >
                          {d}
                          {idx === hojeDiaSemana && (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxAula }, (_, i) => i + 1).map((numeroAula) => (
                      <tr key={numeroAula}>
                        <td className="p-2 border-b font-medium">{numeroAula}ª</td>
                        {DIAS.map((_, diaIdx) => {
                          const aula = aulas?.find((a) => a.diaSemana === diaIdx && a.numeroAula === numeroAula);
                          return (
                            <td key={diaIdx} className="p-2 border-b">
                              {aula ? (
                                <div
                                  className="h-full rounded-md p-2 border-l-4"
                                  style={{
                                    backgroundColor: `${aula.disciplinaCor ?? "#1565C0"}15`,
                                    borderLeftColor: aula.disciplinaCor ?? "#1565C0",
                                  }}
                                >
                                  <div className="font-semibold text-sm truncate">{aula.disciplinaNome}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {aula.turmaNome}{aula.sala ? ` · ${aula.sala}` : ""}
                                  </div>
                                </div>
                              ) : ehHoraAtividade(diaIdx, numeroAula) ? (
                                <div className="h-full rounded-md p-2 border-l-4 bg-amber-50 border-amber-400 flex items-center justify-center">
                                  <span className="text-xs font-semibold text-amber-700">HA</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Livre</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {proximosEventos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Próximos eventos do calendário escolar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {proximosEventos.map((evento) => (
                <div
                  key={evento.id}
                  className="flex items-center justify-between border rounded-md p-3 border-l-4"
                  style={{ borderLeftColor: evento.diaLetivo ? "#1565C0" : "#f59e0b" }}
                >
                  <div>
                    <div className="font-medium">{evento.descricao}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(`${evento.data}T00:00:00`).toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                  </div>
                  <Badge variant={evento.diaLetivo ? "default" : "secondary"}>
                    {evento.tipo}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
                  className="flex items-center justify-between border rounded-md p-3 border-l-4"
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

