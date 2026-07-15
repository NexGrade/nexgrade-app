import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetProfessor, useUpdateProfessor, getGetProfessorQueryKey, useListDisciplinas, getListProfessoresQueryKey, useGetProfessorCarga, useListDisponibilidade, useSetDisponibilidadeLote, getListDisponibilidadeQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useRef, useState } from "react";
import { MultiSelectBusca } from "@/components/multi-select-busca";

const professorSchema = z.object({
  nome: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  telefone: z.string().optional(),
  ativo: z.boolean().default(true),
  disciplinaIds: z.array(z.number()).optional(),
});

type ProfessorFormValues = z.infer<typeof professorSchema>;

const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

export default function ProfessorEditar() {
  const { id } = useParams();
  const professorId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: professor, isLoading: isLoadingProfessor } = useGetProfessor(professorId, { query: { enabled: !!professorId, queryKey: getGetProfessorQueryKey(professorId) } });
  const { data: cargaData, isLoading: isLoadingCarga } = useGetProfessorCarga(professorId, { query: { enabled: !!professorId, queryKey: ["professor-carga", professorId] as const } });
  const updateProfessor = useUpdateProfessor();
  const { data: disciplinas } = useListDisciplinas();

  const form = useForm<ProfessorFormValues>({
    resolver: zodResolver(professorSchema),
    defaultValues: {
      nome: "",
      email: "",
      telefone: "",
      ativo: true,
      disciplinaIds: [],
    },
  });

  const initRef = useRef(false);

  useEffect(() => {
    if (professor && !initRef.current) {
      form.reset({
        nome: professor.nome,
        email: professor.email,
        telefone: professor.telefone || "",
        ativo: professor.ativo,
        disciplinaIds: professor.disciplinaIds || [],
      });
      initRef.current = true;
    }
  }, [professor, form]);

  // Disciplinas únicas que este professor leciona (sem repetir, mesmo
  // que ele dê a mesma disciplina em várias turmas diferentes).
  const disciplinasUnicas = useMemo(() => {
    const ids = form.watch("disciplinaIds") || [];
    const idsUnicos = [...new Set(ids)];
    return idsUnicos
      .map((id) => disciplinas?.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d);
  }, [form.watch("disciplinaIds"), disciplinas]);

  const onSubmit = (data: ProfessorFormValues) => {
    updateProfessor.mutate({ id: professorId, data }, {
      onSuccess: () => {
        toast({ title: "Professor atualizado com sucesso!" });
        queryClient.invalidateQueries({ queryKey: getGetProfessorQueryKey(professorId) });
        queryClient.invalidateQueries({ queryKey: getListProfessoresQueryKey() });
        setLocation("/professores");
      },
      onError: () => {
        toast({ title: "Erro ao atualizar", variant: "destructive" });
      }
    });
  };

  if (isLoadingProfessor) {
    return <div className="space-y-4 max-w-2xl mx-auto">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-[400px] w-full" />
    </div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Editar Professor(a)</h1>
        <p className="text-muted-foreground">Atualize os dados e disciplinas de {professor?.nome}.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Status do Professor</Label>
                      <p className="text-sm text-muted-foreground">Professores inativos não recebem aulas no horário automático.</p>
                    </div>
                    <FormField
                      control={form.control}
                      name="ativo"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="nome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Completo</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="telefone"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Telefone (Opcional)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="disciplinaIds"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-4">
                          <FormLabel className="text-base">Disciplinas</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Selecione as disciplinas que este professor leciona.
                          </p>
                        </div>
                        <FormControl>
                          <MultiSelectBusca
                            options={(disciplinas ?? []).map((d) => ({ value: d.id, label: d.nome }))}
                            value={field.value ?? []}
                            onChange={field.onChange}
                            placeholder="Selecione as disciplinas..."
                            buscarPlaceholder="Buscar disciplina por nome..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-4 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setLocation("/professores")}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={updateProfessor.isPending}>
                      {updateProfessor.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Carga Horária</CardTitle>
              <CardDescription>Total de aulas semanais que o professor tem na escola.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingCarga ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : cargaData ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Semanal</span>
                    <span className="text-2xl font-bold">{cargaData.totalAulas} aulas</span>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Distribuição por Dia</h4>
                    {diasSemana.map((dia, index) => {
                      const aulas = cargaData.porDia[index] || 0;
                      return (
                        <div key={dia} className="flex items-center justify-between">
                          <span className="text-sm">{dia}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${Math.min(100, (aulas / 8) * 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-4 text-right">{aulas}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {disciplinasUnicas.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground pb-1">Disciplinas que leciona</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {disciplinasUnicas.map((d) => (
                          <Badge key={d.id} variant="outline">{d.nome}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados de carga horária disponível.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DisponibilidadeGrade professorId={professorId} />
    </div>
  );
}

// RF-DISP-01/02, RF-PROF-04: grade semanal de disponibilidade do
// professor. Convenção do backend: só é preciso enviar uma exceção
// quando o professor NÃO está disponível — o padrão de toda célula é
// "disponível" até que o usuário marque o contrário aqui.
const DIAS_SEMANA_GRADE = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;
const SLOTS_GRADE = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function DisponibilidadeGrade({ professorId }: { professorId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: disponibilidades, isLoading } = useListDisponibilidade(
    { professorId },
    { query: { enabled: !!professorId, queryKey: getListDisponibilidadeQueryKey({ professorId }) } },
  );
  const salvarLote = useSetDisponibilidadeLote();

  const [indisponiveis, setIndisponiveis] = useState<Map<string, boolean>>(new Map());
  const [turnoGrade, setTurnoGrade] = useState<"matutino" | "vespertino" | "noturno">("matutino");
  const initRef = useRef(false);

  useEffect(() => {
    if (disponibilidades && !initRef.current) {
      const mapa = new Map<string, boolean>();
      disponibilidades
        .filter((d) => !d.disponivel)
        .forEach((d) => mapa.set(`${d.diaSemana}-${d.horarioSlot}`, d.horaAtividadeObrigatoria ?? false));
      setIndisponiveis(mapa);
      const primeiroTurno = disponibilidades.find((d) => !d.disponivel && d.turno)?.turno;
      if (primeiroTurno) setTurnoGrade(primeiroTurno);
      initRef.current = true;
    }
  }, [disponibilidades]);

  const totalIndisponivel = useMemo(() => indisponiveis.size, [indisponiveis]);
  const totalHA = useMemo(() => [...indisponiveis.values()].filter(Boolean).length, [indisponiveis]);

  function alternarCelula(dia: number, slot: number) {
    const key = `${dia}-${slot}`;
    setIndisponiveis((atual) => {
      const proximo = new Map(atual);
      if (!proximo.has(key)) {
        proximo.set(key, false);
      } else if (proximo.get(key) === false) {
        proximo.set(key, true);
      } else {
        proximo.delete(key);
      }
      return proximo;
    });
  }

  function salvar() {
    const itens = DIAS_SEMANA_GRADE.flatMap((_, dia) =>
      SLOTS_GRADE.map((slot) => {
        const key = `${dia}-${slot}`;
        const marcado = indisponiveis.has(key);
        return {
          diaSemana: dia,
          horarioSlot: slot,
          disponivel: !marcado,
          turno: marcado ? turnoGrade : undefined,
          horaAtividadeObrigatoria: marcado ? (indisponiveis.get(key) ?? false) : false,
        };
      }),
    );

    salvarLote.mutate(
      { data: { professorId, itens } },
      {
        onSuccess: () => {
          toast({ title: "Disponibilidade salva com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListDisponibilidadeQueryKey({ professorId }) });
        },
        onError: () => {
          toast({ title: "Erro ao salvar disponibilidade", variant: "destructive" });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disponibilidade Semanal</CardTitle>
        <CardDescription>
          Clique uma vez para marcar indisponível, duas vezes para marcar como Hora-Atividade obrigatória
          (Resolução SEED n.º 7.200/2025, art. 11), três vezes para voltar a disponível. Células não marcadas
          são consideradas disponíveis pelo gerador de horário e pela detecção de conflitos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 max-w-xs">
              <Label className="text-sm shrink-0">Turno desta grade</Label>
              <Select value={turnoGrade} onValueChange={(v) => setTurnoGrade(v as "matutino" | "vespertino" | "noturno")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matutino">Matutino</SelectItem>
                  <SelectItem value="vespertino">Vespertino</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-muted-foreground font-medium">Aula</th>
                    {DIAS_SEMANA_GRADE.map((dia) => (
                      <th key={dia} className="p-2 text-center text-muted-foreground font-medium">
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS_GRADE.map((slot) => (
                    <tr key={slot} className="border-t">
                      <td className="p-2 text-muted-foreground">{slot}ª</td>
                      {DIAS_SEMANA_GRADE.map((_, dia) => {
                        const key = `${dia}-${slot}`;
                        const ehHA = indisponiveis.get(key) === true;
                        const marcado = indisponiveis.has(key);
                        return (
                          <td key={key} className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => alternarCelula(dia, slot)}
                              aria-pressed={marcado}
                              className={
                                "h-8 w-full rounded-md border text-xs font-medium transition-colors " +
                                (ehHA
                                  ? "bg-[#42A5F5]/15 border-[#1565C0]/40 text-[#0D47A1]"
                                  : marcado
                                  ? "bg-destructive/10 border-destructive/40 text-destructive"
                                  : "bg-muted/40 border-transparent hover:border-muted-foreground/30")
                              }
                            >
                              {ehHA ? "Hora-Atividade" : marcado ? "Indisponível" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                {totalIndisponivel} período(s) indisponível(is), {totalHA} de Hora-Atividade obrigatória.
              </p>
              <Button onClick={salvar} disabled={salvarLote.isPending}>
                {salvarLote.isPending ? "Salvando..." : "Salvar Disponibilidade"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
