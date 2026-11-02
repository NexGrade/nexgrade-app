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

// [LICENCA-SEM-DADO-SENSIVEL] (01/11/2026) a licenca guarda so o periodo e o substituto: tipo de lista fechada,
// sem saude e sem campo de texto livre (LGPD: minimizacao). Ver api-server/src/lib/licenca-neutra.ts.
const TIPOS = [
  { valor: "afastamento", rotulo: "Afastamento" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "capacitacao", rotulo: "Capacitação" },
  { valor: "outros", rotulo: "Outro" },
] as const;
const rotuloTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.rotulo ?? "Afastamento";
const SEM_SUBSTITUTO = "sem";

const licencaSchema = z.object({
  professorId: z.coerce.number().min(1, "Selecione um professor"),
  tipo: z.enum(["afastamento", "ferias", "capacitacao", "outros"]),
  dataInicio: z.string().min(1, "Informe a data de início"),
  dataFim: z.string().min(1, "Informe a data de fim"),
  professorSubstitutoId: z.number().int().optional(),
}).refine((v) => !v.dataInicio || !v.dataFim || v.dataFim >= v.dataInicio, { message: "A data de fim vem antes do início", path: ["dataFim"] });
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
    defaultValues: { professorId: undefined, tipo: "afastamento", dataInicio: "", dataFim: "", professorSubstitutoId: undefined },
  });

  const handleOpenCreate = () => {
    form.reset({ professorId: undefined, tipo: "afastamento", dataInicio: "", dataFim: "", professorSubstitutoId: undefined });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: LicencaFormValues) => {
    createLicenca.mutate({ data }, {
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
      <div className="flex flex-wrap justify-between items-center gap-3">{/* [CELULAR-PEDAGOGIA] (01/11/2026) titulo e botao quebram no celular */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Licenças</h1>
          <p className="text-muted-foreground">Gerencie afastamentos e licenças de professores.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Nova Licença</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">{/* [CELULAR-DIALOGO] (01/11/2026) rola quando o teclado do celular sobe */}
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
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {TIPOS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Não registre o motivo (por exemplo, de saúde): basta o período e o substituto.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  name="professorSubstitutoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Substituto (opcional)</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === SEM_SUBSTITUTO ? undefined : Number(v))} value={field.value ? String(field.value) : SEM_SUBSTITUTO}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={SEM_SUBSTITUTO}>Sem substituto</SelectItem>
                          {professores?.filter((p) => p.id !== form.watch("professorId")).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
              <CardContent className="pt-6 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{nomeProfessor(licenca.professorId)}</h3>
                    <Badge variant="outline">{rotuloTipo(licenca.tipo)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatarData(licenca.dataInicio)} — {formatarData(licenca.dataFim)}
                    {licenca.professorSubstitutoId ? ` · Substituto: ${nomeProfessor(licenca.professorSubstitutoId)}` : ""}
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
