import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetProfessor, useUpdateProfessor, getGetProfessorQueryKey, useListDisciplinas, getListProfessoresQueryKey, useGetProfessorCarga } from "@workspace/api-client-react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
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

          {/* Disponibilidade agora vive só na página dedicada
             (/disponibilidade), turno-aware e com horários reais —
             evita manter duas implementações divergentes da mesma
             funcionalidade. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#1565C0]" />
                Disponibilidade Semanal
              </CardTitle>
              <CardDescription>
                Gerencie os dias e horários em que {professor?.nome ?? "este professor"} não pode dar aula.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/disponibilidade?professorId=${professorId}`}>
                <Button variant="outline" className="w-full justify-between">
                  Gerenciar disponibilidade
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
