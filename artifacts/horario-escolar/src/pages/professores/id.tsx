import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetProfessor, useUpdateProfessor, getGetProfessorQueryKey, useListDisciplinas, getListProfessoresQueryKey, useGetProfessorCarga, customFetch } from "@workspace/api-client-react";
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
import { CalendarClock, ArrowRight, RefreshCw, AlertTriangle, CheckCircle2, X, Wrench } from "lucide-react";
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

const TURNO_ROTULO_PROFESSOR: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
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
  // [NOVO] Estado da correção cirúrgica (POST /api/horarios/corrigir-professor).
  const [corrigindo, setCorrigindo] = useState(false);
  const [resultadoCorrecao, setResultadoCorrecao] = useState<{
    movidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; de: { dia: number; aula: number }; para: { dia: number; aula: number } }>;
    naoResolvidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; dia: number; aula: number; motivo: string }>;
    mensagem?: string;
  } | null>(null);
  const [detalheRegeneracao, setDetalheRegeneracao] = useState<{ nomeExperimental: string; totalTurmas: number; resultados: DetalheTurmaRegeneracao[] } | null>(null);

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

  // [FIX CRÍTICO] Antes gravava DIRETO na grade oficial -- foi essa
  // escolha que causou o incidente descrito no backend (ver comentário
  // em routes/horarios.ts, POST /gerar-professor). Agora o backend
  // sempre grava num experimento; aqui só precisamos apontar o usuário
  // pro Modo Experimental pra revisar e decidir se promove. Sem
  // confirm() antes, já que essa ação não altera mais a grade oficial
  // sozinha -- é só uma prévia.
  const handleRegenerarTurmasDoProfessor = async () => {
    setRegenerando(true);
    setDetalheRegeneracao(null);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      // [FIX] fetch() sem token Bearer -- voltava 401 antes de gerar
      // qualquer prévia. customFetch já anexa o token.
      const data = await customFetch<{
        nomeExperimental: string;
        totalTurmas: number;
        resultados: DetalheTurmaRegeneracao[];
      }>(`${basePath}/api/horarios/gerar-professor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorId, reduzirJanelas: true, fatorPedagogico: false, compactarCargaHoraria: false }),
        responseType: "json",
      });
      const totalConflitos = data.resultados.reduce((s: number, r: DetalheTurmaRegeneracao) => s + r.conflitos.length, 0);
      toast({
        title: `Prévia gerada: "${data.nomeExperimental}" (${data.totalTurmas} turma(s))`,
        description: `${totalConflitos > 0 ? `${totalConflitos} aviso(s). ` : ""}Nada mudou na grade oficial ainda — revise em Horário → Modo Experimental e promova só se estiver bom.`,
      });
      setDetalheRegeneracao({ nomeExperimental: data.nomeExperimental, totalTurmas: data.totalTurmas, resultados: data.resultados });
      queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
    } catch (err) {
      toast({ title: "Não foi possível gerar a prévia", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setRegenerando(false);
    }
  };

  // [NOVO] Correção cirúrgica: move só as aulas deste professor que
  // estão em conflito com a disponibilidade atual, pra um horário
  // livre válido -- sem regenerar nada mais. Grava direto (não é uma
  // prévia) porque o blast radius é mínimo: só aulas que JÁ estavam em
  // conflito mudam de lugar, cada uma como uma atualização de uma
  // linha só.
  const handleCorrigirConflitos = async () => {
    setCorrigindo(true);
    setResultadoCorrecao(null);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const data = await customFetch<{
        movidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; de: { dia: number; aula: number }; para: { dia: number; aula: number } }>;
        naoResolvidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; dia: number; aula: number; motivo: string }>;
        mensagem?: string;
      }>(`${basePath}/api/horarios/corrigir-professor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorId }),
        responseType: "json",
      });
      if (data.mensagem) {
        toast({ title: data.mensagem });
      } else {
        toast({
          title: `${data.movidas.length} aula(s) corrigida(s)${data.naoResolvidas.length > 0 ? `, ${data.naoResolvidas.length} sem solução automática` : ""}.`,
        });
      }
      setResultadoCorrecao({ movidas: data.movidas, naoResolvidas: data.naoResolvidas, mensagem: data.mensagem });
      queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      queryClient.invalidateQueries({ queryKey: ["professor-carga", professorId] as const });
    } catch (err) {
      toast({ title: "Não foi possível corrigir", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setCorrigindo(false);
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

          {/* [FIX] Antes esse card dava a entender que a mudança já
              tinha sido aplicada na grade oficial. Agora é sempre só
              uma PRÉVIA (experimento) -- deixa isso explícito e leva
              pro Modo Experimental pra revisar e promover, em vez de
              aplicar direto daqui. */}
          {detalheRegeneracao && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Prévia gerada ({detalheRegeneracao.totalTurmas} turma(s)) — nada aplicado ainda
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Turmas com aviso (disciplina não alocada por completo) ou erro aparecem abaixo. Isso ainda NÃO mudou a grade oficial — revise em Horário → Modo Experimental (experimento "{detalheRegeneracao.nomeExperimental}") e promova só se estiver bom.
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDetalheRegeneracao(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Link href="/horario?tab=experimental">
                  <Button variant="outline" size="sm" className="gap-1.5 mb-2">
                    Ir pro Modo Experimental
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
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
          <Card>
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

                  {cargaData.bloqueiosResumoPorTurno && Object.keys(cargaData.bloqueiosResumoPorTurno).length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground pb-1">Disponibilidade</h4>
                      <div className="space-y-1.5">
                        {Object.entries(cargaData.bloqueiosResumoPorTurno).map(([turno, resumo]) => (
                          <div key={turno} className="text-sm">
                            <span className="font-medium">{TURNO_ROTULO_PROFESSOR[turno] ?? turno}:</span>{" "}
                            <span className="text-muted-foreground">{resumo}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {disciplinasUnicas.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground pb-1">Disciplinas que leciona</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {disciplinasUnicas.map((d) => (
                          <Badge key={d.id} variant="outline" className="whitespace-normal text-left h-auto py-1">{d.nome}</Badge>
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

          {/* [NOVO] Correção cirúrgica -- resolve só as aulas deste
              professor que estão em conflito com a disponibilidade
              atual, movendo cada uma pro primeiro horário livre válido
              na mesma turma. É a opção recomendada primeiro: muito
              menor risco que "Regenerar Horário" (que refaz a turma
              inteira do zero). */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#1565C0]" />
                Corrigir Conflitos (recomendado)
              </CardTitle>
              <CardDescription>
                Move só as aulas de {professor?.nome ?? "este professor"} que ficaram em conflito com a disponibilidade atual — sem regenerar a turma inteira nem mexer em aulas que já estavam certas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full justify-between"
                onClick={handleCorrigirConflitos}
                disabled={corrigindo}
              >
                <span className="whitespace-normal text-left">{corrigindo ? "Corrigindo..." : "Corrigir conflitos deste professor"}</span>
                <Wrench className={`w-4 h-4 ${corrigindo ? "animate-pulse" : ""}`} />
              </Button>
              {resultadoCorrecao && !resultadoCorrecao.mensagem && (
                <div className="mt-3 space-y-2">
                  {resultadoCorrecao.movidas.length > 0 && (
                    <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2.5 space-y-1">
                      <p className="font-medium flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {resultadoCorrecao.movidas.length} aula(s) movida(s):</p>
                      {resultadoCorrecao.movidas.map((m, i) => (
                        <p key={i}>• {m.turmaNome}: {diasSemana[m.de.dia]} {m.de.aula}ª → {diasSemana[m.para.dia]} {m.para.aula}ª</p>
                      ))}
                    </div>
                  )}
                  {resultadoCorrecao.naoResolvidas.length > 0 && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5 space-y-1">
                      <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {resultadoCorrecao.naoResolvidas.length} sem solução automática — precisa de ajuste manual:</p>
                      {resultadoCorrecao.naoResolvidas.map((n, i) => (
                        <p key={i}>• {n.turmaNome}: {diasSemana[n.dia]} {n.aula}ª — {n.motivo}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* [FIX] Antes gravava direto na grade oficial. Agora só gera
              uma PRÉVIA (experimento) das turmas em que este professor
              está envolvido -- útil depois de atualizar a
              disponibilidade dele/dela, sem precisar regenerar o
              turno inteiro nem ir turma por turma manualmente, mas
              sempre com chance de revisar antes de aplicar. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#1565C0]" />
                Regenerar Horário (prévia)
              </CardTitle>
              <CardDescription>
                Gera uma prévia (experimento) só das turmas em que {professor?.nome ?? "este professor"} dá aula (ou está vinculado por disciplina) — sem mexer nas demais turmas da escola, e sem alterar a grade oficial até você revisar e promover.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={handleRegenerarTurmasDoProfessor}
                disabled={regenerando}
              >
                <span className="whitespace-normal text-left">{regenerando ? "Gerando prévia..." : "Gerar prévia das turmas deste professor"}</span>
                <RefreshCw className={`w-4 h-4 ${regenerando ? "animate-spin" : ""}`} />
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Não altera a grade oficial sozinho — a prévia fica em Horário → Modo Experimental até você decidir promover.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
