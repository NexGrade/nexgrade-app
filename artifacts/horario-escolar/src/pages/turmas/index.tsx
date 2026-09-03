import {
  useListTurmas, useCreateTurma, useUpdateTurma, useDeleteTurma, getListTurmasQueryKey,
  useListDisciplinas, useListCursos, useListMatrizesCurriculares, getListMatrizesCurricularesQueryKey,
  useAplicarMatrizTurma, useGetMatrizCurricularPorId, getGetMatrizCurricularPorIdQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, GraduationCap, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

const turmaSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório"),
  serie: z.string().min(1, "A série é obrigatória"),
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  anoLetivo: z.coerce.number().min(2000).max(2100),
  disciplinaIds: z.array(z.number()).optional(),
});
type TurmaFormValues = z.infer<typeof turmaSchema>;

export default function TurmasList() {
  const { data: turmas, isLoading } = useListTurmas();
  const { busca, setBusca, itensFiltrados: turmasFiltradas } = useListaFiltrada(turmas, (t) => t.nome);
  const deleteTurma = useDeleteTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleOpenCreate = () => { setEditingId(null); setIsDialogOpen(true); };
  const handleOpenEdit = (turma: any) => { setEditingId(turma.id); setIsDialogOpen(true); };

  const handleDelete = (id: number) => {
    deleteTurma.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Turma removida" });
          queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
        },
        onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
      },
    );
  };

  const turnoLabels: Record<string, string> = { matutino: "Matutino", vespertino: "Vespertino", noturno: "Noturno" };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Turmas</h1>
          <p className="text-muted-foreground">Gerencie as turmas e suas grades curriculares.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Nova Turma</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            {isDialogOpen && (
              <TurmaForm
                editingId={editingId}
                turmaAtual={editingId ? turmas?.find((t) => t.id === editingId) : undefined}
                onFechar={() => setIsDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <CampoBusca
        value={busca}
        onChange={setBusca}
        placeholder="Buscar turma por nome..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : turmas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma turma cadastrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie as turmas para começar a montar os horários.</p>
        </div>
      ) : turmasFiltradas.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Nenhuma turma encontrada para "{busca}".</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {turmasFiltradas.map((turma) => (
            <Card key={turma.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{turma.nome}</h3>
                      <Badge variant="outline">{turnoLabels[turma.turno]}</Badge>
                      <Badge variant="secondary">{turma.anoLetivo}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Série: {turma.serie} • {(turma.disciplinaIds || []).length} disciplinas
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/turmas/${turma.id}/horario`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                      <CalendarDays className="mr-2 h-4 w-4" />Horário
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(turma)}><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover turma?</AlertDialogTitle>
                          <AlertDialogDescription>Isso removerá a turma e todo o seu horário. Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(turma.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Formulário (criar/editar), com integração Curso > Matriz ───────────

function TurmaForm({ editingId, turmaAtual, onFechar }: { editingId: number | null; turmaAtual: any; onFechar: () => void }) {
  const { data: disciplinas } = useListDisciplinas();
  const { data: cursos } = useListCursos();
  const [nivel, setNivel] = useState("");
  const [cursoId, setCursoId] = useState("");
  const [matrizId, setMatrizId] = useState("");
  // [NOVO 03/09] Se a turma que estamos editando ja tem uma matriz
  // aplicada, busca os dados dela (curso + nivel) pra pre-preencher os
  // selects automaticamente -- antes isso sempre abria vazio, forcando
  // reselecao manual toda vez, mesmo pra turma ja montada certinho.
  const matrizJaAplicadaId = turmaAtual?.matrizCurricularId ?? undefined;
  const { data: matrizDaTurma } = useGetMatrizCurricularPorId(
    matrizJaAplicadaId ?? 0,
    { query: { enabled: !!matrizJaAplicadaId, queryKey: getGetMatrizCurricularPorIdQueryKey(matrizJaAplicadaId ?? 0) } },
  );
  useEffect(() => {
    if (matrizDaTurma && !matrizId) {
      setNivel(matrizDaTurma.nivel ?? "");
      setCursoId(String(matrizDaTurma.cursoId));
      setMatrizId(String(matrizDaTurma.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrizDaTurma]);
  const cursosFiltrados = nivel ? cursos?.filter((c) => c.nivel === nivel) : cursos;
  const { data: matrizes } = useListMatrizesCurriculares(
    Number(cursoId),
    { query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(Number(cursoId)) } },
  );
  const matrizSelecionada = matrizes?.find((m) => m.id === Number(matrizId));

  const createTurma = useCreateTurma();
  const updateTurma = useUpdateTurma();
  const aplicarMatriz = useAplicarMatrizTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<TurmaFormValues>({
    resolver: zodResolver(turmaSchema),
    defaultValues: {
      nome: turmaAtual?.nome ?? "",
      serie: turmaAtual?.serie ?? "",
      turno: (turmaAtual?.turno as any) ?? "matutino",
      anoLetivo: turmaAtual?.anoLetivo ?? new Date().getFullYear(),
      disciplinaIds: turmaAtual?.disciplinaIds ?? [],
    },
  });

  function selecionarMatriz(id: string) {
    setMatrizId(id);
    const m = matrizes?.find((mm) => mm.id === Number(id));
    if (m) form.setValue("serie", m.serieAno, { shouldValidate: true });
  }

  async function onSubmit(data: TurmaFormValues) {
    try {
      let turmaId = editingId;
      // [FIX 03/09] Se a turma ja tinha uma matriz aplicada e o usuario
      // NAO trocou de matriz nesta sessao (Nivel/Curso/Serie continuam
      // vazios, que e o estado padrao ao abrir o formulario), NAO manda
      // disciplinaIds -- evita que o backend desvincule a matriz por
      // engano em qualquer edicao trivial (RF-TUR-02/03 em turmas.ts so
      // deveria disparar numa edicao manual de verdade, nao como efeito
      // colateral de abrir e salvar o formulario sem mexer em nada).
      const matrizJaAplicadaSemTroca = !matrizId && !!turmaAtual?.matrizCurricularId;
      const omitirDisciplinaIds = !!matrizId || matrizJaAplicadaSemTroca;
      if (editingId) {
        await updateTurma.mutateAsync({ id: editingId, data: omitirDisciplinaIds ? { ...data, disciplinaIds: undefined } : data });
      } else {
        const nova = await createTurma.mutateAsync({ data: matrizId ? { ...data, disciplinaIds: undefined } : data });
        turmaId = nova.id;
      }
      if (matrizId && turmaId) {
        await aplicarMatriz.mutateAsync({ id: turmaId, data: { matrizCurricularId: Number(matrizId) } });
      }
      toast({ title: editingId ? "Turma atualizada com sucesso!" : "Turma criada com sucesso!" });
      queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
      onFechar();
    } catch {
      toast({ title: "Erro ao salvar turma", variant: "destructive" });
    }
  }

  const salvando = createTurma.isPending || updateTurma.isPending || aplicarMatriz.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editingId ? "Editar Turma" : "Nova Turma"}</DialogTitle>
        <DialogDescription>
          {editingId ? "Altere os dados da turma abaixo." : "Escolha o curso e a matriz curricular — as disciplinas e cargas horárias vêm preenchidas automaticamente."}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">Curso e Matriz Curricular (recomendado)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nível</label>
                <Select value={nivel} onValueChange={(v) => { setNivel(v); setCursoId(""); setMatrizId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fundamental">Ensino Fundamental</SelectItem>
                    <SelectItem value="medio">Ensino Médio</SelectItem>
                    <SelectItem value="tecnico">Técnico / Profissionalizante</SelectItem>
                    <SelectItem value="normal_magisterio">Formação de Docentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Curso</label>
                <Select value={cursoId} onValueChange={(v) => { setCursoId(v); setMatrizId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o curso" /></SelectTrigger>
                  <SelectContent>
                    {cursosFiltrados?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Série / Matriz</label>
                <Select value={matrizId} onValueChange={selecionarMatriz} disabled={!cursoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                  <SelectContent>
                    {matrizes?.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.serieAno} ({m.cargaHorariaSemanalTotal}h/semana)</SelectItem>)}
                  </SelectContent>
                </Select>
                {cursoId && matrizes && matrizes.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Este curso ainda não tem matriz cadastrada. Vá em <strong>Cursos</strong>, expanda "{cursos?.find((c) => c.id === Number(cursoId))?.nome}" e crie uma matriz primeiro.
                  </p>
                )}
              </div>
            </div>
            {matrizSelecionada && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Disciplinas desta matriz (aplicadas automaticamente):</p>
                <div className="flex flex-wrap gap-1.5">
                  {matrizSelecionada.itens.map((item: any) => (
                    <span key={item.id} className="text-xs border rounded px-2 py-1 bg-background">
                      {item.disciplina?.nome} ({item.cargaHorariaSemanal}h)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da Turma</FormLabel>
                <FormControl><Input placeholder="Ex: 1º Ano A" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="serie" render={({ field }) => (
              <FormItem>
                <FormLabel>Série / Ano{matrizId && <span className="font-normal text-muted-foreground"> (preenchido pela matriz)</span>}</FormLabel>
                <FormControl><Input placeholder="Ex: 1º Ano do Ensino Médio" {...field} readOnly={!!matrizId} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="turno" render={({ field }) => (
              <FormItem>
                <FormLabel>Turno</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione um turno" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="matutino">Matutino</SelectItem>
                    <SelectItem value="vespertino">Vespertino</SelectItem>
                    <SelectItem value="noturno">Noturno</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="anoLetivo" render={({ field }) => (
              <FormItem>
                <FormLabel>Ano Letivo</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {!matrizId && (
            <FormField
              control={form.control}
              name="disciplinaIds"
              render={() => (
                <FormItem>
                  <div className="mb-2">
                    <FormLabel className="text-base">Disciplinas da Turma (manual)</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Sem curso/matriz selecionado acima — marque as disciplinas manualmente.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto p-1">
                    {disciplinas?.map((disciplina) => (
                      <FormField
                        key={disciplina.id}
                        control={form.control}
                        name="disciplinaIds"
                        render={({ field }) => {
                          const value = field.value || [];
                          return (
                            <FormItem key={disciplina.id} className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                              <FormControl>
                                <Checkbox
                                  checked={value.includes(disciplina.id)}
                                  onCheckedChange={(checked) => checked
                                    ? field.onChange([...value, disciplina.id])
                                    : field.onChange(value.filter((v) => v !== disciplina.id))}
                                />
                              </FormControl>
                              <FormLabel className="font-medium cursor-pointer">{disciplina.nome}</FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar Turma"}</Button>
          </div>
        </form>
      </Form>
    </>
  );
}
