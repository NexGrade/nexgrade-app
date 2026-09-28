import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { UserButton, useOrganization } from "@clerk/react";
import {
  useGetMinhaAgendaNotificacoes,
  useMarcarMinhaNotificacaoLida,
  getGetMinhaAgendaNotificacoesQueryKey,
} from "@workspace/api-client-react";
import { NotificationBell } from "@/components/notification-bell";
import { CalendarDays, Download, Loader2, Plus, MonitorSmartphone } from "lucide-react";
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
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
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
    // [DICA] Alguns navegadores nao selecionam "Paisagem" sozinhos
    // no dialogo de impressao, mesmo com a orientacao configurada no
    // CSS -- avisa o usuario pra conferir/marcar manualmente antes
    // de salvar, evitando conteudo cortado.
    toast({
      title: "Dica de impressão",
      description: 'Na tela que abrir, confira se "Paisagem" está selecionado em Layout antes de salvar.',
    });
    window.print();
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
          <p className="text-sm text-muted-foreground">{professor.nome}{organization?.name && <> &middot; <span className="font-medium text-foreground">{organization.name}</span></>}</p>
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
          <Button
            variant={mostrarCalendario ? "default" : "outline"}
            onClick={() => setMostrarCalendario((v) => !v)}
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            {mostrarCalendario ? "Ocultar calendário" : "Ver calendário"}
          </Button>
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
          <NovaReservaDialog professorId={professor.id} />
        </div>

        {mostrarCalendario && (
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Calendário escolar -- próximos eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {proximosEventos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento próximo cadastrado.</p>
              ) : (
                proximosEventos.map((evento) => (
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
                ))
              )}
            </CardContent>
          </Card>
        )}

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
                                <th key={d} className={`text-left p-2 border-b ${idx === hojeDiaSemana ? "text-primary font-semibold bg-primary/5" : ""}`}>
                                  {d}
                                  {idx === hojeDiaSemana && (
                                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
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
                                    <td key={diaIdx} className={`p-2 border-b h-14 ${hoje ? "bg-primary/5" : ""}`}>
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
                                          <span className="text-xs font-semibold text-amber-700">HA</span>
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
                              </button>
                            ))}
                          </div>
                          <div className="space-y-2">
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
                                        {aula.assincrona && (
                                          <div className="mt-1 flex flex-wrap items-center gap-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wide rounded bg-violet-100 text-violet-800 px-1.5 py-0.5">Assíncrona</span>
                                            {aviso && <span className="text-[10px] font-semibold text-rose-700">{aviso}</span>}
                                          </div>
                                        )}
                                      </div>
                                    ) : ehHA(diaAtivo, n) ? (
                                      <div className="rounded-md px-3 py-2 border-l-4 bg-amber-50 border-amber-400 text-sm font-semibold text-amber-700">HA</div>
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

