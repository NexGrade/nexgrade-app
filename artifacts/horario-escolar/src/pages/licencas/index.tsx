import { useListLicencas, useCreateLicenca, useDeleteLicenca, getListLicencasQueryKey, useListProfessores } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, FileText } from "lucide-react";
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

const licencaSchema = z.object({
  professorId: z.coerce.number().min(1, "Selecione um professor"),
  tipo: z.string().min(1, "Informe o tipo"),
  dataInicio: z.string().min(1, "Informe a data de início"),
  dataFim: z.string().min(1, "Informe a data de fim"),
  observacoes: z.string().optional(),
});
type LicencaFormValues = z.infer<typeof licencaSchema>;

export default function LicencasList() {
  const { data: licencas, isLoading } = useListLicencas();
  const { data: professores } = useListProfessores();
  const createLicenca = useCreateLicenca();
  const deleteLicenca = useDeleteLicenca();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  function nomeProfessor(id: number) {
    return professores?.find((p) => p.id === id)?.nome ?? `#${id}`;
  }

  const { busca, setBusca, itensFiltrados: licencasFiltradas } = useListaFiltrada(
    licencas,
    (l) => nomeProfessor(l.professorId),
  );

  const form = useForm<LicencaFormValues>({
    resolver: zodResolver(licencaSchema),
    defaultValues: { professorId: undefined, tipo: "", dataInicio: "", dataFim: "", observacoes: "" },
  });

  const handleOpenCreate = () => {
    form.reset({ professorId: undefined, tipo: "", dataInicio: "", dataFim: "", observacoes: "" });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: LicencaFormValues) => {
    createLicenca.mutate({ data: data as any }, {
      onSuccess: () => {
        toast({ title: "Licença registrada!" });
        queryClient.invalidateQueries({ queryKey: getListLicencasQueryKey() });
        setIsDialogOpen(false);
      },
      onError: () => toast({ title: "Erro ao registrar licença", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    deleteLicenca.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Licença removida" });
        queryClient.invalidateQueries({ queryKey: getListLicencasQueryKey() });
      },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    });
  };

  function formatarData(data: string) {
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Licenças</h1>
          <p className="text-muted-foreground">Gerencie afastamentos e licenças de professores.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Nova Licença</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Licença</DialogTitle>
              <DialogDescription>Registre um afastamento de professor.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="professorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Professor</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : undefined}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o professor" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {professores?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de licença</FormLabel>
                      <FormControl><Input placeholder="Ex: Licença médica" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dataInicio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de início</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dataFim"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de fim</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações (opcional)</FormLabel>
                      <FormControl><Input placeholder="Detalhes adicionais" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createLicenca.isPending}>
                    {createLicenca.isPending ? "Salvando..." : "Registrar Licença"}
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
        placeholder="Buscar por nome do professor..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : licencas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma licença registrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Registre afastamentos de professores aqui.</p>
        </div>
      ) : licencasFiltradas.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Nenhuma licença encontrada para "{busca}".</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {licencasFiltradas.map((licenca) => (
            <Card key={licenca.id}>
              <CardContent className="pt-6 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{nomeProfessor(licenca.professorId)}</h3>
                    <Badge variant="outline">{licenca.tipo}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatarData(licenca.dataInicio)} — {formatarData(licenca.dataFim)}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover licença?</AlertDialogTitle>
                      <AlertDialogDescription>Isso removerá o registro de afastamento.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(licenca.id)}>Remover</AlertDialogAction>
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
