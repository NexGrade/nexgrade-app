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
import { CalendarClock, ArrowRight, RefreshCw, AlertTriangle, CheckCircle2, X } from "lucide-react";
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

// [NOVO] Resultado por turma da regeneração escopada a este professor
// (POST /api/horarios/gerar-professor) -- mesmo padrão de detalhe já
// usado no Modo Experimental pra geração em lote, reaproveitado aqui.
type DetalheTurmaRegeneracao = {
  turmaId: number;
  turmaNome: string;
  slotsGerados: number;
  conflitos: string[];
  erro?: string;
};

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

  // [NOVO] Estado da regeneração escopada a este professor.
  const [regenerando, setRegenerando] = useState(false);
  const [detalheRegeneracao, setDetalheRegeneracao] = useState<{ totalTurmas: number; resultados: DetalheTurmaRegeneracao[] } | null>(null);

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

  // [NOVO] Regenera só as turmas em que este professor está envolvido
  // (POST /api/horarios/gerar-professor) -- pede confirmação antes,
  // já que grava direto na grade oficial de cada turma (mesmo aviso
  // do botão "Gerar Horário Automático" em Turmas → Horário: substitui
  // a grade inteira daquelas turmas, não só as aulas deste professor).
  const handleRegenerarTurmasDoProfessor = async () => {
    if (!confirm(`Regenerar a grade de todas as turmas de ${professor?.nome ?? "este professor"}? Isso substitui a grade OFICIAL inteira de cada turma envolvida (não só as aulas dele/dela).`)) return;
    setRegenerando(true);
    setDetalheRegeneracao(null);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${basePath}/api/horarios/gerar-professor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorId, reduzirJanelas: true, fatorPedagogico: false, compactarCargaHoraria: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Não foi possível regenerar", description: data.error ?? "Erro desconhecido", variant: "destructive" });
        return;
      }
      const totalConflitos = data.resultados.reduce((s: number, r: DetalheTurmaRegeneracao) => s + r.conflitos.length, 0);
      toast({
        title: `Grade regenerada! ${data.totalTurmas} turma(s) atualizada(s).`,
        description: totalConflitos > 0 ? `${totalConflitos} aviso(s) — confira o detalhe abaixo.` : undefined,
      });
      setDetalheRegeneracao({ totalTurmas: data.totalTurmas, resultados: data.resultados });
      queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      queryClient.invalidateQueries({ queryKey: ["professor-carga", professorId] as const });
    } catch {
      toast({ title: "Erro ao conectar com o servidor", variant: "destructive" });
    } finally {
      setRegenerando(false);
    }
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
        <div className="lg:col-span-2 space-y-6">
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

          {/* [NOVO] Detalhe por turma da última regeneração escopada a
              este professor -- mesmo padrão do card usado no Modo
              Experimental, adaptado pra essa ação. */}
          {detalheRegeneracao && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Detalhe da regeneração ({detalheRegeneracao.totalTurmas} turma(s))
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Turmas com aviso (disciplina não alocada por completo) ou erro aparecem abaixo. Turmas sem nenhuma linha aqui foram alocadas 100%.
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDetalheRegeneracao(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {detalheRegeneracao.resultados.filter((r) => r.conflitos.length > 0 || r.erro).length === 0 ? (
                  <p className="text-sm text-green-700 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Todas as turmas foram alocadas sem avisos.
                  </p>
                ) : (
                  detalheRegeneracao.resultados
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
                    {/* [FIX] `cargaData.porDia` vem do backend com chaves
                        de NOME do dia ("Segunda", "Terça"...), não por
                        índice numérico -- por isso sempre lia
                        `undefined` e caía no "|| 0", mostrando 0 pra
                        todo mundo mesmo com aulas reais cadastradas. */}
                    {diasSemana.map((dia) => {
                      const aulas = cargaData.porDia[dia] || 0;
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

          {/* [NOVO] Regenera só as turmas em que este professor está
              envolvido -- útil depois de atualizar a disponibilidade
              dele/dela, sem precisar regenerar o turno inteiro nem ir
              turma por turma manualmente. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#1565C0]" />
                Regenerar Horário
              </CardTitle>
              <CardDescription>
                Regera automaticamente só as turmas em que {professor?.nome ?? "este professor"} dá aula (ou está vinculado por disciplina) — sem mexer nas demais turmas da escola.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={handleRegenerarTurmasDoProfessor}
                disabled={regenerando}
              >
                {regenerando ? "Regenerando..." : "Regenerar turmas deste professor"}
                <RefreshCw className={`w-4 h-4 ${regenerando ? "animate-spin" : ""}`} />
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Atenção: substitui a grade oficial inteira de cada turma envolvida (não só as aulas dele/dela).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
