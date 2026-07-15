import { useListComunicados, useCreateComunicado, useDeleteComunicado, getListComunicadosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Bell } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

const comunicadoSchema = z.object({
  titulo: z.string().min(1, "Informe o título"),
  mensagem: z.string().min(1, "Informe a mensagem"),
});
type ComunicadoFormValues = z.infer<typeof comunicadoSchema>;

export default function ComunicadosList() {
  const { data: comunicados, isLoading } = useListComunicados();
  const { busca, setBusca, itensFiltrados: comunicadosFiltrados } = useListaFiltrada(comunicados, (c) => c.titulo);
  const createComunicado = useCreateComunicado();
  const deleteComunicado = useDeleteComunicado();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<ComunicadoFormValues>({
    resolver: zodResolver(comunicadoSchema),
    defaultValues: { titulo: "", mensagem: "" },
  });

  const handleOpenCreate = () => {
    form.reset({ titulo: "", mensagem: "" });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: ComunicadoFormValues) => {
    createComunicado.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Comunicado enviado!" });
        queryClient.invalidateQueries({ queryKey: getListComunicadosQueryKey() });
        setIsDialogOpen(false);
      },
      onError: () => toast({ title: "Erro ao enviar comunicado", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    deleteComunicado.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Comunicado removido" });
        queryClient.invalidateQueries({ queryKey: getListComunicadosQueryKey() });
      },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    });
  };

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comunicados</h1>
          <p className="text-muted-foreground">Envie avisos e comunicados para a escola.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Novo Comunicado</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Comunicado</DialogTitle>
              <DialogDescription>Escreva o comunicado a ser publicado.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="titulo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl><Input placeholder="Ex: Reunião de pais" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mensagem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem</FormLabel>
                      <FormControl><Textarea rows={4} placeholder="Escreva o conteúdo do comunicado..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createComunicado.isPending}>
                    {createComunicado.isPending ? "Enviando..." : "Enviar Comunicado"}
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
        placeholder="Buscar comunicado por título..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : comunicados?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhum comunicado</h3>
          <p className="text-sm text-muted-foreground mt-1">Envie avisos para a comunidade escolar aqui.</p>
        </div>
      ) : comunicadosFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Nenhum comunicado encontrado para "{busca}".</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {comunicadosFiltrados.map((comunicado) => (
            <Card key={comunicado.id}>
              <CardContent className="pt-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{comunicado.titulo}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{comunicado.mensagem}</p>
                  {comunicado.createdAt && (
                    <p className="text-xs text-muted-foreground mt-2">{formatarData(comunicado.createdAt)}</p>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover comunicado?</AlertDialogTitle>
                      <AlertDialogDescription>Isso removerá "{comunicado.titulo}" permanentemente.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(comunicado.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
