import { useListTurmas, useCreateTurma, useUpdateTurma, useDeleteTurma, getListTurmasQueryKey, useListDisciplinas } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, GraduationCap, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

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
  const { data: disciplinas } = useListDisciplinas();
  const deleteTurma = useDeleteTurma();
  const createTurma = useCreateTurma();
  const updateTurma = useUpdateTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<TurmaFormValues>({
    resolver: zodResolver(turmaSchema),
    defaultValues: {
      nome: "",
      serie: "",
      turno: "matutino",
      anoLetivo: new Date().getFullYear(),
      disciplinaIds: [],
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({
      nome: "",
      serie: "",
      turno: "matutino",
      anoLetivo: new Date().getFullYear(),
      disciplinaIds: [],
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (turma: any) => {
    setEditingId(turma.id);
    form.reset({
      nome: turma.nome,
      serie: turma.serie,
      turno: turma.turno as any,
      anoLetivo: turma.anoLetivo,
      disciplinaIds: turma.disciplinaIds || [],
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: TurmaFormValues) => {
    if (editingId) {
      updateTurma.mutate({ id: editingId, data }, {
        onSuccess: () => {
          toast({ title: "Turma atualizada com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => {
          toast({ title: "Erro ao atualizar", variant: "destructive" });
        }
      });
    } else {
      createTurma.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Turma criada com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => {
          toast({ title: "Erro ao criar", variant: "destructive" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteTurma.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Turma removida" });
        queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
      },
      onError: () => {
        toast({ title: "Erro ao remover", variant: "destructive" });
      }
    });
  };

  const turnoLabels: Record<string, string> = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    noturno: "Noturno"
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Turmas</h1>
          <p className="text-muted-foreground">Gerencie as turmas e suas grades curriculares.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Turma
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Turma" : "Nova Turma"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Altere os dados da turma abaixo." : "Preencha os dados da nova turma."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="nome"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Turma</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 1º Ano A" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="serie"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Série / Ano</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 1º Ano do Ensino Médio" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="turno"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Turno</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um turno" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="matutino">Matutino</SelectItem>
                            <SelectItem value="vespertino">Vespertino</SelectItem>
                            <SelectItem value="noturno">Noturno</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="anoLetivo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ano Letivo</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="disciplinaIds"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel className="text-base">Disciplinas da Turma</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Selecione as disciplinas que farão parte da grade desta turma.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1">
                        {disciplinas?.map((disciplina) => (
                          <FormField
                            key={disciplina.id}
                            control={form.control}
                            name="disciplinaIds"
                            render={({ field }) => {
                              const value = field.value || [];
                              return (
                                <FormItem
                                  key={disciplina.id}
                                  className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={value.includes(disciplina.id)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...value, disciplina.id])
                                          : field.onChange(
                                              value.filter((val) => val !== disciplina.id)
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="font-medium cursor-pointer">
                                      {disciplina.nome}
                                    </FormLabel>
                                  </div>
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
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={createTurma.isPending || updateTurma.isPending}>
                    {createTurma.isPending || updateTurma.isPending ? "Salvando..." : "Salvar Turma"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : turmas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma turma cadastrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie as turmas para começar a montar os horários.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {turmas?.map((turma) => (
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
                      <CalendarDays className="mr-2 h-4 w-4" />
                      Horário
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(turma)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover turma?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá a turma e todo o seu horário. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(turma.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remover
                          </AlertDialogAction>
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
