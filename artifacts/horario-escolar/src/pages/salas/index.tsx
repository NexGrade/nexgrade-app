import { useListSalas, useCreateSala, useDeleteSala, useUpdateSala, getListSalasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

const TIPOS_SALA = [
  { value: "comum", label: "Sala Comum" },
  { value: "laboratorio", label: "Laboratório de Informática" },
  { value: "quadra", label: "Quadra Poliesportiva" },
];

const salaSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório"),
  capacidade: z.coerce.number().min(1),
  tipo: z.string().default("comum"),
});
type SalaFormValues = z.infer<typeof salaSchema>;

export default function SalasList() {
  const { data: salas, isLoading } = useListSalas();
  const { busca, setBusca, itensFiltrados: salasFiltradas } = useListaFiltrada(salas, (s) => s.nome);
  const createSala = useCreateSala();
  const updateSala = useUpdateSala();
  const deleteSala = useDeleteSala();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<SalaFormValues>({
    resolver: zodResolver(salaSchema),
    defaultValues: { nome: "", capacidade: 30, tipo: "comum" },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({ nome: "", capacidade: 30, tipo: "comum" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (sala: any) => {
    setEditingId(sala.id);
    form.reset({ nome: sala.nome, capacidade: sala.capacidade, tipo: sala.tipo ?? "comum" });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: SalaFormValues) => {
    if (editingId) {
      updateSala.mutate({ id: editingId, data: data as any }, {
        onSuccess: () => {
          toast({ title: "Sala atualizada!" });
          queryClient.invalidateQueries({ queryKey: getListSalasQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      });
    } else {
      createSala.mutate({ data: data as any }, {
        onSuccess: () => {
          toast({ title: "Sala criada!" });
          queryClient.invalidateQueries({ queryKey: getListSalasQueryKey() });
          setIsDialogOpen(false);
        },
        onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteSala.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Sala removida" });
        queryClient.invalidateQueries({ queryKey: getListSalasQueryKey() });
      },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    });
  };

  function tipoLabel(tipo?: string) {
    return TIPOS_SALA.find((t) => t.value === tipo)?.label ?? "Sala Comum";
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salas</h1>
          <p className="text-muted-foreground">Gerencie os espaços físicos disponíveis para aulas.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Nova Sala</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Sala" : "Nova Sala"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Altere os dados da sala abaixo." : "Preencha os dados da nova sala."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Sala</FormLabel>
                      <FormControl><Input placeholder="Ex: Sala 12" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capacidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacidade</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {TIPOS_SALA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createSala.isPending || updateSala.isPending}>
                    {createSala.isPending || updateSala.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <CampoBusca
        value={busca}
        onChange={setBusca}
        placeholder="Buscar sala por nome..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : salas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma sala cadastrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Cadastre as salas disponíveis para montar os horários.</p>
        </div>
      ) : salasFiltradas.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Nenhuma sala encontrada para "{busca}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {salasFiltradas.map((sala) => (
            <Card key={sala.id}>
              <CardContent className="pt-6 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{sala.nome}</h3>
                    <Badge variant="outline" className="mt-1">{tipoLabel(sala.tipo)}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(sala)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover sala?</AlertDialogTitle>
                          <AlertDialogDescription>Isso removerá "{sala.nome}" e desvinculará os horários associados.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(sala.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Capacidade: {sala.capacidade} alunos</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
