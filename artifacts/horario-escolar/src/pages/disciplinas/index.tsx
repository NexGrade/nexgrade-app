import { useListDisciplinas, useCreateDisciplina, useDeleteDisciplina, useUpdateDisciplina, getListDisciplinasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, BookOpen } from "lucide-react";
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

const disciplinaSchema = z.object({
  nome: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  cargaSemanal: z.coerce.number().min(1).max(10),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida (ex: #FF0000)"),
  codigoSae: z.string().optional(),
  tipoSalaExigido: z.string().optional(),
});

type DisciplinaFormValues = z.infer<typeof disciplinaSchema>;

export default function DisciplinasList() {
  const { data: disciplinas, isLoading } = useListDisciplinas();
  const deleteDisciplina = useDeleteDisciplina();
  const createDisciplina = useCreateDisciplina();
  const updateDisciplina = useUpdateDisciplina();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<DisciplinaFormValues>({
    resolver: zodResolver(disciplinaSchema),
    defaultValues: {
      nome: "",
      cargaSemanal: 2,
      cor: "#3b82f6",
      codigoSae: "",
      tipoSalaExigido: "",
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({ nome: "", cargaSemanal: 2, cor: "#3b82f6", codigoSae: "", tipoSalaExigido: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (disciplina: any) => {
    setEditingId(disciplina.id);
    form.reset({
      nome: disciplina.nome,
      cargaSemanal: disciplina.cargaSemanal,
      cor: disciplina.cor,
      codigoSae: disciplina.codigoSae ?? "",
      tipoSalaExigido: disciplina.tipoSalaExigido ?? "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: DisciplinaFormValues) => {
    const payload = {
      ...data,
      codigoSae: data.codigoSae?.trim() || undefined,
      tipoSalaExigido: data.tipoSalaExigido?.trim() || undefined,
    };
    if (editingId) {
      updateDisciplina.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Disciplina atualizada com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => {
          toast({ title: "Erro ao atualizar", variant: "destructive" });
        }
      });
    } else {
      createDisciplina.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Disciplina criada com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => {
          toast({ title: "Erro ao criar", variant: "destructive" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteDisciplina.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Disciplina removida" });
        queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
      },
      onError: () => {
        toast({ title: "Erro ao remover", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Disciplinas</h1>
          <p className="text-muted-foreground">Gerencie as matérias da grade curricular.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Disciplina
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Disciplina" : "Nova Disciplina"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Altere os dados da disciplina abaixo." : "Preencha os dados da nova disciplina."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Disciplina</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Matemática" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cargaSemanal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aulas por Semana</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="cor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor no Horário</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input type="color" className="w-12 h-10 p-1 cursor-pointer" {...field} />
                          </FormControl>
                          <Input className="flex-1 uppercase font-mono" {...field} />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="codigoSae"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código SAE (opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 2700" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tipoSalaExigido"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sala exigida (opcional)</FormLabel>
                        <Select value={field.value || "nenhuma"} onValueChange={(v) => field.onChange(v === "nenhuma" ? "" : v)}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="nenhuma">Nenhuma (sala comum)</SelectItem>
                            <SelectItem value="laboratorio">Laboratório de Informática</SelectItem>
                            <SelectItem value="quadra">Quadra Poliesportiva</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={createDisciplina.isPending || updateDisciplina.isPending}>
                    Salvar
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : disciplinas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma disciplina</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie as disciplinas que farão parte das turmas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {disciplinas?.map((disciplina) => (
            <Card key={disciplina.id} className="overflow-hidden border-l-4" style={{ borderLeftColor: disciplina.cor }}>
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: disciplina.cor }} />
                    <h3 className="font-semibold text-lg">{disciplina.nome}</h3>
                  </div>
                  {disciplina.codigoSae && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1565C0]/10 text-[#1565C0]">
                      SAE {disciplina.codigoSae}
                    </span>
                  )}
                </div>
                
                <div className="mt-auto flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{disciplina.cargaSemanal}</span> aulas/semana
                  </div>
                  
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleOpenEdit(disciplina)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover disciplina?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá a disciplina de todas as turmas e professores associados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(disciplina.id)}
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
