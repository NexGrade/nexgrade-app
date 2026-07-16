import { useState } from "react";
import {
  useListDisciplinas,
  useCreateDisciplina,
  useDeleteDisciplina,
  useUpdateDisciplina,
  getListDisciplinasQueryKey,
  useListDisciplinasCatalogo,
  useAdicionarDisciplinasCatalogoSelecionadas,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, BookOpen, LayoutGrid, List, LibraryBig } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";
import { MultiSelectBusca } from "@/components/multi-select-busca";
import { cn } from "@/lib/utils";

const CATEGORIAS = ["BNC", "PD", "FGB", "PFO", "IFA", "IF", "IFP", "APF"] as const;
const CATEGORIA_LABEL: Record<string, string> = {
  BNC: "Base Nacional Comum",
  PD: "Parte Diversificada",
  FGB: "Formação Geral Básica",
  PFO: "Percurso Formativo Obrigatório",
  IFA: "Itinerário Formativo de Aprofundamento",
  IF: "Itinerário Formativo",
  IFP: "Itinerário Formativo Profissional",
  APF: "Aprofundamento Profissional",
};

const disciplinaSchema = z.object({
  nome: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  cargaSemanal: z.coerce.number().min(1).max(10),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida (ex: #FF0000)"),
  codigoSae: z.string().optional(),
  tipoSalaExigido: z.string().optional(),
  categoriaCurricularPadrao: z.string().optional(),
});

type DisciplinaFormValues = z.infer<typeof disciplinaSchema>;

type ModoVisualizacao = "grade" | "lista";

export default function DisciplinasList() {
  const { data: disciplinas, isLoading } = useListDisciplinas();
  const { busca, setBusca, itensFiltrados: disciplinasFiltradas } = useListaFiltrada(disciplinas, (d) => d.nome);
  const deleteDisciplina = useDeleteDisciplina();
  const createDisciplina = useCreateDisciplina();
  const updateDisciplina = useUpdateDisciplina();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoVisualizacao>("grade");

  const form = useForm<DisciplinaFormValues>({
    resolver: zodResolver(disciplinaSchema),
    defaultValues: {
      nome: "",
      cargaSemanal: 2,
      cor: "#3b82f6",
      codigoSae: "",
      tipoSalaExigido: "",
      categoriaCurricularPadrao: "",
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({ nome: "", cargaSemanal: 2, cor: "#3b82f6", codigoSae: "", tipoSalaExigido: "", categoriaCurricularPadrao: "" });
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
      categoriaCurricularPadrao: disciplina.categoriaCurricularPadrao ?? "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: DisciplinaFormValues) => {
    const payload = {
      ...data,
      codigoSae: data.codigoSae?.trim() || undefined,
      tipoSalaExigido: data.tipoSalaExigido?.trim() || undefined,
      categoriaCurricularPadrao: (data.categoriaCurricularPadrao || undefined) as any,
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

  const dialogFormulario = (
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

            <FormField
              control={form.control}
              name="categoriaCurricularPadrao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria curricular fixa (opcional)</FormLabel>
                  <Select value={field.value || "nenhuma"} onValueChange={(v) => field.onChange(v === "nenhuma" ? "" : v)}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="nenhuma">Nenhuma (flexível — qualquer categoria)</SelectItem>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c} value={c}>{c} — {CATEGORIA_LABEL[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Quando definida, esta disciplina só aparece ao montar uma Grade Curricular dessa categoria específica.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

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
  );

  const dialogoExcluir = (disciplina: any) => (
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
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Disciplinas</h1>
          <p className="text-muted-foreground">Gerencie as matérias da grade curricular.</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <DialogCatalogo disciplinasDaEscola={disciplinas ?? []} />
            {dialogFormulario}
          </div>
          <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setModo("grade")}
              title="Ver em grade"
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded transition-colors",
                modo === "grade" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setModo("lista")}
              title="Ver em lista"
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded transition-colors",
                modo === "lista" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <CampoBusca
        value={busca}
        onChange={setBusca}
        placeholder="Buscar disciplina por nome..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : disciplinas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma disciplina</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione disciplinas do catálogo mestre ou crie novas manualmente.
          </p>
        </div>
      ) : disciplinasFiltradas.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-sm text-muted-foreground">Nenhuma disciplina encontrada para "{busca}".</p>
        </div>
      ) : modo === "grade" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {disciplinasFiltradas.map((disciplina) => (
            <Card key={disciplina.id} className="overflow-hidden border-l-4" style={{ borderLeftColor: disciplina.cor }}>
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: disciplina.cor }} />
                    <h3 className="font-semibold text-lg">{disciplina.nome}</h3>
                  </div>
                  <div className="flex gap-1">
                    {disciplina.categoriaCurricularPadrao && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {disciplina.categoriaCurricularPadrao}
                      </span>
                    )}
                    {disciplina.codigoSae && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1565C0]/10 text-[#1565C0]">
                        SAE {disciplina.codigoSae}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{disciplina.cargaSemanal}</span> aulas/semana
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleOpenEdit(disciplina)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    {dialogoExcluir(disciplina)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border bg-muted/40">
            <span>Nome</span>
            <span className="w-16 text-center">Categoria</span>
            <span className="w-20 text-center">SAE</span>
            <span className="w-24 text-center">Aulas/sem.</span>
            <span className="w-20 text-center">Ações</span>
          </div>
          <div className="divide-y divide-border">
            {disciplinasFiltradas.map((disciplina) => (
              <div
                key={disciplina.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-2.5 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: disciplina.cor }} />
                  <span className="font-medium truncate">{disciplina.nome}</span>
                </div>
                <div className="w-16 flex justify-center">
                  {disciplina.categoriaCurricularPadrao ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {disciplina.categoriaCurricularPadrao}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <div className="w-20 flex justify-center">
                  {disciplina.codigoSae ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1565C0]/10 text-[#1565C0]">
                      {disciplina.codigoSae}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <div className="w-24 text-center text-sm text-muted-foreground">
                  {disciplina.cargaSemanal}
                </div>
                <div className="w-20 flex items-center justify-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleOpenEdit(disciplina)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  {dialogoExcluir(disciplina)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// [NOVO] Seleção do catálogo mestre — permite adicionar disciplinas já
// com nome/SAE corretos, sem digitar do zero. Ver
// routes/disciplinas-catalogo.ts (backend faz o filtro de duplicata
// definitivo; aqui filtramos visualmente também, por UX).
function DialogCatalogo({ disciplinasDaEscola }: { disciplinasDaEscola: any[] }) {
  const [open, setOpen] = useState(false);
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const { data: catalogo, isLoading } = useListDisciplinasCatalogo({ query: { enabled: open } });
  const adicionar = useAdicionarDisciplinasCatalogoSelecionadas();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const saesDaEscola = new Set(disciplinasDaEscola.map((d) => d.codigoSae).filter(Boolean));
  const nomesDaEscola = new Set(disciplinasDaEscola.map((d) => d.nome.trim().toLowerCase()));

  const disponiveis = (catalogo ?? []).filter((item) => {
    if (item.codigoSae && saesDaEscola.has(item.codigoSae)) return false;
    if (!item.codigoSae && nomesDaEscola.has(item.nome.trim().toLowerCase())) return false;
    return true;
  });

  function confirmar() {
    if (selecionadas.length === 0) return;
    adicionar.mutate(
      { data: { catalogoIds: selecionadas } },
      {
        onSuccess: (result) => {
          toast({
            title: `${result.criadas.length} disciplina(s) adicionada(s)!`,
            description: result.jaExistiam > 0 ? `${result.jaExistiam} já existia(m) e foram ignoradas.` : undefined,
          });
          queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
          setSelecionadas([]);
          setOpen(false);
        },
        onError: () => toast({ title: "Erro ao adicionar disciplinas", variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LibraryBig className="mr-2 h-4 w-4" />
          Adicionar do Catálogo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar do Catálogo Mestre</DialogTitle>
          <DialogDescription>
            Selecione as disciplinas oficiais (SEED-PR/SAE) que esta escola utiliza. Nomes e códigos já vêm
            preenchidos corretamente.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <MultiSelectBusca
            options={disponiveis.map((item) => ({ value: item.id, label: item.nome }))}
            value={selecionadas}
            onChange={setSelecionadas}
            placeholder="Selecione as disciplinas do catálogo..."
            buscarPlaceholder="Buscar por nome..."
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={selecionadas.length === 0 || adicionar.isPending}>
            {adicionar.isPending ? "Adicionando..." : `Adicionar ${selecionadas.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
