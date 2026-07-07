import { useListCursos, useCreateCurso, useDeleteCurso, getListCursosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Library, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
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

// RF-CUR-01: cadastro de curso (nível + código opcional). A Matriz
// Curricular de cada série fica na página de detalhe (ver cursos/id.tsx).
const NIVEIS = [
  { value: "fundamental", label: "Ensino Fundamental" },
  { value: "medio", label: "Ensino Médio" },
  { value: "tecnico", label: "Técnico / Profissionalizante" },
  { value: "normal_magisterio", label: "Formação de Docentes (Normal/Magistério)" },
] as const;

const cursoSchema = z.object({
  nome: z.string().min(2, "Informe o nome do curso"),
  codigoCurso: z.string().optional(),
  nivel: z.enum(["fundamental", "medio", "tecnico", "normal_magisterio"]),
});

type CursoFormValues = z.infer<typeof cursoSchema>;

export default function CursosList() {
  const { data: cursos, isLoading } = useListCursos();
  const createCurso = useCreateCurso();
  const deleteCurso = useDeleteCurso();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<CursoFormValues>({
    resolver: zodResolver(cursoSchema),
    defaultValues: { nome: "", codigoCurso: "", nivel: "fundamental" },
  });

  function onSubmit(data: CursoFormValues) {
    createCurso.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Curso cadastrado com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: () => toast({ title: "Erro ao cadastrar curso", variant: "destructive" }),
      },
    );
  }

  function onDelete(id: number) {
    deleteCurso.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Curso removido" });
          queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() });
        },
        onError: () => toast({ title: "Erro ao remover curso", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cursos</h1>
          <p className="text-muted-foreground">
            Cada curso organiza a Matriz Curricular por série/ano — a base para gerar a carga horária esperada de
            cada turma (RF-CUR).
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Curso
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Curso</DialogTitle>
              <DialogDescription>Depois de criado, adicione as matrizes curriculares por série.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do curso</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex.: Ensino Médio Regular" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="codigoCurso"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código do curso (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex.: 2341" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nivel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nível</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {NIVEIS.map((n) => (
                            <SelectItem key={n.value} value={n.value}>
                              {n.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createCurso.isPending}>
                    {createCurso.isPending ? "Salvando..." : "Criar Curso"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : cursos && cursos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cursos.map((curso) => {
            const nivelLabel = NIVEIS.find((n) => n.value === curso.nivel)?.label ?? curso.nivel;
            return (
              <Card key={curso.id}>
                <CardContent className="pt-6 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{curso.nome}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{nivelLabel}</Badge>
                        {curso.codigoCurso && <Badge variant="secondary">Código {curso.codigoCurso}</Badge>}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover curso?</AlertDialogTitle>
                          <AlertDialogDescription>
                            As matrizes curriculares vinculadas a "{curso.nome}" também serão removidas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(curso.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <Link href={`/cursos/${curso.id}`}>
                    <Button variant="outline" className="w-full justify-between">
                      Matriz Curricular
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Library className="w-10 h-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum curso cadastrado</h3>
            <p className="text-muted-foreground max-w-sm">
              Cadastre um curso para começar a montar sua Matriz Curricular por série.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
