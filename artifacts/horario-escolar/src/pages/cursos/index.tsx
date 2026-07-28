import {
  useListCursos, useCreateCurso, useDeleteCurso, getListCursosQueryKey,
  useListMatrizesCurriculares, getListMatrizesCurricularesQueryKey,
  useCreateMatrizCurricular, useDeleteMatrizCurricular, useUpdateMatrizCurricular,
  useAdicionarItemMatriz, useRemoverItemMatriz,
  useListDisciplinas, useCreateDisciplina, useListTurmas, useAplicarMatrizTurma,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Library, ChevronDown, ChevronRight, Copy, Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { CURSOS_TECNICOS_POR_EIXO } from "@/lib/cursos-tecnicos-cnct";
import type { MatrizOficialTemplate, MatrizTecnicaTemplate } from "@/lib/matrizes-tipos";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

// RF-CUR: hub único do curso — Curso > Matriz Curricular (série/ano) >
// Itens (disciplinas por categoria). Substitui as antigas telas
// separadas /cursos, /cursos/:id e /grade-curricular, reduzindo o menu.

const NIVEIS = [
  { value: "fundamental", label: "Ensino Fundamental" },
  { value: "medio", label: "Ensino Médio" },
  { value: "tecnico", label: "Técnico / Profissionalizante" },
  { value: "normal_magisterio", label: "Formação de Docentes (Normal/Magistério)" },
] as const;

const FORMAS_OFERTA = [
  { value: "integrada", label: "Integrada" },
  { value: "concomitante_intercomplementar", label: "Concomitante Intercomplementar" },
] as const;

const EIXOS_TECNOLOGICOS = [
  { value: "ambiente_saude", label: "Ambiente e Saúde" },
  { value: "controle_processos_industriais", label: "Controle e Processos Industriais" },
  { value: "desenvolvimento_educacional_social", label: "Desenvolvimento Educacional e Social" },
  { value: "gestao_negocios", label: "Gestão e Negócios" },
  { value: "informacao_comunicacao", label: "Informação e Comunicação" },
  { value: "infraestrutura", label: "Infraestrutura" },
  { value: "militar", label: "Militar" },
  { value: "producao_alimenticia", label: "Produção Alimentícia" },
  { value: "producao_cultural_design", label: "Produção Cultural e Design" },
  { value: "producao_industrial", label: "Produção Industrial" },
  { value: "recursos_naturais", label: "Recursos Naturais" },
  { value: "seguranca", label: "Segurança" },
  { value: "turismo_hospitalidade_lazer", label: "Turismo, Hospitalidade e Lazer" },
] as const;

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

const cursoSchema = z.object({
  nome: z.string().min(2, "Informe o nome do curso"),
  codigoCurso: z.string().optional(),
  nivel: z.enum(["fundamental", "medio", "tecnico", "normal_magisterio"]),
  eixoTecnologico: z.string().optional(),
  formaOferta: z.string().optional(),
});
type CursoFormValues = z.infer<typeof cursoSchema>;

export default function CursosList() {
  const { data: cursos, isLoading } = useListCursos();
  const { busca, setBusca, itensFiltrados: cursosFiltrados } = useListaFiltrada(cursos, (c) => c.nome);
  const createCurso = useCreateCurso();
  const deleteCurso = useDeleteCurso();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cursoAberto, setCursoAberto] = useState<number | null>(null);

  const form = useForm<CursoFormValues>({
    resolver: zodResolver(cursoSchema),
    defaultValues: { nome: "", codigoCurso: "", nivel: "fundamental", eixoTecnologico: "", formaOferta: "" },
  });

  const nivelSelecionado = form.watch("nivel");
  const eixoSelecionado = form.watch("eixoTecnologico");
  const sugestoes = eixoSelecionado ? CURSOS_TECNICOS_POR_EIXO[eixoSelecionado] ?? [] : [];

  function onSubmit(data: CursoFormValues) {
    const payload = {
      ...data,
      eixoTecnologico: data.nivel === "tecnico" ? (data.eixoTecnologico || undefined) : undefined,
      formaOferta: data.nivel === "tecnico" ? (data.formaOferta || undefined) : undefined,
    };
    createCurso.mutate(
      { data: payload as any },
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

  function onDeleteCurso(id: number) {
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
            Curso → Matriz Curricular por série → Disciplinas por categoria. Clique num curso para expandir.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Novo Curso</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Curso</DialogTitle>
              <DialogDescription>Depois de criado, expanda o curso para adicionar matrizes.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nivel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nível</FormLabel>
                      <Select
                        onValueChange={(v) => { field.onChange(v); if (v !== "tecnico") form.setValue("eixoTecnologico", ""); }}
                        defaultValue={field.value}
                      >
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {NIVEIS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {nivelSelecionado === "tecnico" && (
                  <FormField
                    control={form.control}
                    name="eixoTecnologico"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Eixo tecnológico (CNCT/MEC)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecione o eixo" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {EIXOS_TECNOLOGICOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {nivelSelecionado === "tecnico" && (
                  <FormField
                    control={form.control}
                    name="formaOferta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forma de oferta</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecione a forma de oferta" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {FORMAS_OFERTA.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {nivelSelecionado === "tecnico" && eixoSelecionado && sugestoes.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Curso oficial do CNCT ({sugestoes.length} disponíveis)
                    </label>
                    <Select
                      onValueChange={(v) => {
                        const c = sugestoes.find((s) => s.nome === v);
                        if (!c) return;
                        form.setValue("nome", c.nome, { shouldValidate: true });
                        // [CORRIGIDO] Antes preenchia codigoCurso com o CBO (c.cbo) —
                        // CBO é código de OCUPAÇÃO (Classificação Brasileira de
                        // Ocupações), não é o código oficial do curso na SEED-PR.
                        // Misturar os dois gerava cadastros com "código do curso"
                        // sem sentido (ex: "3251-15" em vez do código real, tipo
                        // "2538"). O CBO já aparece só como referência no texto de
                        // cada opção da lista; o campo de código fica em branco
                        // pra a escola preencher com o código de curso de verdade,
                        // se souber.
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar curso da lista oficial..." /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {sugestoes.map((c) => <SelectItem key={c.nome} value={c.nome}>{c.nome}{c.cbo ? ` (CBO ${c.cbo})` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do curso{nivelSelecionado === "tecnico" && sugestoes.length > 0 && <span className="font-normal text-muted-foreground"> (ou digite se não encontrar acima)</span>}</FormLabel>
                      <FormControl><Input placeholder="Ex.: Ensino Médio Regular" {...field} /></FormControl>
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
                      <FormControl><Input placeholder="Ex.: 2341 — código oficial SEED-PR, não é o CBO" {...field} /></FormControl>
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

      <CampoBusca
        value={busca}
        onChange={setBusca}
        placeholder="Buscar curso por nome..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : cursos && cursos.length > 0 && cursosFiltrados.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum curso encontrado para "{busca}".</CardContent></Card>
      ) : cursos && cursos.length > 0 ? (
        <div className="space-y-3">
          {cursosFiltrados.map((curso) => {
            const isOpen = cursoAberto === curso.id;
            const nivelLabel = NIVEIS.find((n) => n.value === curso.nivel)?.label ?? curso.nivel;
            const eixoLabel = EIXOS_TECNOLOGICOS.find((e) => e.value === (curso as any).eixoTecnologico)?.label;
            const formaOfertaLabel = FORMAS_OFERTA.find((f) => f.value === (curso as any).formaOferta)?.label;
            return (
              <Card key={curso.id} className="overflow-hidden">
                <button
                  onClick={() => setCursoAberto(isOpen ? null : curso.id)}
                  className={`w-full flex items-center justify-between px-5 py-4 text-left ${isOpen ? "bg-muted/30" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div>
                      <div className="font-semibold">{curso.nome}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline">{nivelLabel}</Badge>
                        {eixoLabel && <Badge variant="outline">{eixoLabel}</Badge>}
                        {formaOfertaLabel && <Badge variant="outline" className="bg-[#42A5F5]/10 text-[#1565C0] border-[#42A5F5]/30">{formaOfertaLabel}</Badge>}
                        {curso.codigoCurso && <Badge variant="secondary">Código {curso.codigoCurso}</Badge>}
                      </div>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <span role="button" className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </span>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover curso?</AlertDialogTitle>
                        <AlertDialogDescription>As matrizes curriculares vinculadas a "{curso.nome}" também serão removidas.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDeleteCurso(curso.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </button>
                {isOpen && (
                  <MatrizesDoCurso
                    cursoId={curso.id}
                    nivelCurso={curso.nivel}
                    nomeCurso={curso.nome}
                    formaOfertaCurso={(curso as any).formaOferta}
                  />
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Library className="w-10 h-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum curso cadastrado</h3>
            <p className="text-muted-foreground max-w-sm">Cadastre um curso para começar a montar sua Matriz Curricular por série.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Nível 2: Matrizes do curso ─────────────────────────────────────────────

function MatrizesDoCurso({
  cursoId, nivelCurso, nomeCurso, formaOfertaCurso,
}: { cursoId: number; nivelCurso: string; nomeCurso: string; formaOfertaCurso?: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: matrizes, isLoading } = useListMatrizesCurriculares(cursoId, {
    query: { queryKey: getListMatrizesCurricularesQueryKey(cursoId) },
  });
  const criarMatriz = useCreateMatrizCurricular();
  const deletarMatriz = useDeleteMatrizCurricular();
  const [matrizAberta, setMatrizAberta] = useState<number | null>(null);
  const [novaSerie, setNovaSerie] = useState("");
  const [novoCodigoSere, setNovoCodigoSere] = useState("");
  const [criandoMatriz, setCriandoMatriz] = useState(false);
  const [modeloAberto, setModeloAberto] = useState(false);

  // [ALTERADO] Antes checava os arrays de dados inteiros (importados
  // direto no bundle). Agora os dados só são buscados quando o modal
  // abre (ver AplicarModeloOficial abaixo) -- então aqui só decide se
  // o botão aparece, sem precisar baixar o catálogo pra isso. Todo
  // nível usado no app (fundamental, medio, tecnico) tem modelo
  // oficial disponível; se um caso específico não tiver, o próprio
  // modal já avisa "não achamos um modelo oficial" ao abrir.
  const temModelosOficiais = true;

  function criar() {
    if (!novaSerie.trim()) return;
    criarMatriz.mutate(
      { cursoId, data: { serieAno: novaSerie.trim(), codigoMatrizSere: novoCodigoSere.trim() || undefined, itens: [] } },
      {
        onSuccess: (nova) => {
          toast({ title: "Matriz criada!" });
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
          setNovaSerie("");
          setNovoCodigoSere("");
          setCriandoMatriz(false);
          setMatrizAberta(nova.id);
        },
        onError: () => toast({ title: "Erro ao criar matriz", variant: "destructive" }),
      },
    );
  }

  function excluir(matrizId: number) {
    deletarMatriz.mutate(
      { cursoId, matrizId },
      {
        onSuccess: () => {
          toast({ title: "Matriz removida" });
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
        },
        onError: () => toast({ title: "Erro ao remover matriz", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="px-5 pb-5 pt-1 border-t bg-muted/10">
      {isLoading ? (
        <Skeleton className="h-12 w-full mt-3" />
      ) : (
        <div className="space-y-2 mt-3">
          {matrizes?.map((matriz) => {
            const isOpen = matrizAberta === matriz.id;
            return (
              <Card key={matriz.id} className="overflow-hidden">
                <button
                  onClick={() => setMatrizAberta(isOpen ? null : matriz.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${isOpen ? "bg-muted/30" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="font-medium text-sm">{matriz.serieAno}</span>
                    <span className="text-xs text-muted-foreground">({matriz.cargaHorariaSemanalTotal}h/semana)</span>
                    {(matriz as any).codigoMatrizSere && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        SERE {(matriz as any).codigoMatrizSere}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isOpen && <CodigoSereEditor cursoId={cursoId} matriz={matriz} />}
                    <AlertDialog>
                      <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <span role="button" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover matriz "{matriz.serieAno}"?</AlertDialogTitle>
                          <AlertDialogDescription>Todos os itens desta matriz também serão removidos.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir(matriz.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </button>
                {isOpen && <ItensDaMatriz cursoId={cursoId} matriz={matriz} />}
              </Card>
            );
          })}

          <div className="flex items-center gap-4 mt-1">
            {!criandoMatriz ? (
              <button onClick={() => setCriandoMatriz(true)} className="text-xs text-primary font-medium flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Nova matriz (série/ano)
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  placeholder='Ex.: "1ª Série", "6º Ano"'
                  value={novaSerie}
                  onChange={(e) => setNovaSerie(e.target.value)}
                  className="max-w-xs h-9"
                />
                <Input
                  placeholder="Código SERE (opcional)"
                  value={novoCodigoSere}
                  onChange={(e) => setNovoCodigoSere(e.target.value)}
                  className="max-w-[180px] h-9"
                />
                <Button size="sm" onClick={criar} disabled={criarMatriz.isPending || !novaSerie.trim()}>
                  {criarMatriz.isPending ? "Criando..." : "Criar"}
                </Button>
                <button onClick={() => { setCriandoMatriz(false); setNovaSerie(""); setNovoCodigoSere(""); }} className="text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {temModelosOficiais && !criandoMatriz && (
              <button onClick={() => setModeloAberto(true)} className="text-xs text-[#1565C0] font-medium flex items-center gap-1">
                <Library className="h-3.5 w-3.5" /> Aplicar modelo oficial (SEED-PR)
              </button>
            )}
          </div>

          {matrizes && matrizes.length === 0 && !criandoMatriz && (
            <p className="text-xs text-muted-foreground py-2">Nenhuma matriz cadastrada ainda para este curso.</p>
          )}
        </div>
      )}

      {modeloAberto && (
        <AplicarModeloOficial
          cursoId={cursoId}
          nivelCurso={nivelCurso}
          nomeCurso={nomeCurso}
          formaOfertaCurso={formaOfertaCurso}
          onFechar={() => setModeloAberto(false)}
        />
      )}
    </div>
  );
}

// ── Aplicar modelo oficial SEED-PR (resolve/cria disciplinas + monta a matriz) ──

function normalizar(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/técnico em |tecnico em /gi, "")
    .trim();
}

const FORMA_OFERTA_LABEL: Record<string, string> = {
  integrada: "Integrada",
  concomitante_intercomplementar: "Concomitante Intercomplementar",
};

function AplicarModeloOficial({
  cursoId, nivelCurso, nomeCurso, formaOfertaCurso, onFechar,
}: { cursoId: number; nivelCurso: string; nomeCurso: string; formaOfertaCurso?: string | null; onFechar: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: disciplinas } = useListDisciplinas();
  const criarDisciplina = useCreateDisciplina();
  const criarMatriz = useCreateMatrizCurricular();
  const [aplicando, setAplicando] = useState(false);

  const ehTecnico = nivelCurso === "tecnico";

  // [ALTERADO] Os dados das matrizes oficiais (antes importados direto
  // do bundle) agora vêm de uma rota autenticada -- só carregam quando
  // esse modal abre (já que o componente só monta nesse momento), não
  // no carregamento inicial da página. react-query cacheia entre
  // aberturas do modal, então só busca de verdade na primeira vez.
  const { data: matrizesTecnicas, isLoading: carregandoTecnicas } = useQuery({
    queryKey: ["/matrizes-oficiais/tecnicas"],
    queryFn: () => customFetch<MatrizTecnicaTemplate[]>("/api/matrizes-oficiais/tecnicas", { responseType: "json" }),
    enabled: ehTecnico,
    staleTime: 10 * 60_000,
  });
  const { data: matrizesGerais, isLoading: carregandoGerais } = useQuery({
    queryKey: ["/matrizes-oficiais/gerais"],
    queryFn: () => customFetch<MatrizOficialTemplate[]>("/api/matrizes-oficiais/gerais", { responseType: "json" }),
    enabled: !ehTecnico,
    staleTime: 10 * 60_000,
  });
  const carregandoModelos = ehTecnico ? carregandoTecnicas : carregandoGerais;

  // ── Fundamental / Médio: escolhe modalidade + série ──
  const templatesGerais = (matrizesGerais ?? []).filter((m) => m.nivel === nivelCurso);
  const [modeloId, setModeloId] = useState("");
  const [serieIdx, setSerieIdx] = useState("");
  const modeloGeral = templatesGerais.find((m) => m.id === modeloId);
  const serieGeral = modeloGeral?.series[Number(serieIdx)];

  // ── Técnico: casa pelo nome do curso E pela forma de oferta, deixa trocar manualmente ──
  // [NOVO] Um mesmo nome de curso pode existir em mais de uma forma de oferta
  // (ex: "Técnico em Farmácia" integrada x concomitante intercomplementar) com
  // grades diferentes — por isso o casamento automático agora exige nome E
  // formaOferta batendo. Se o curso não tiver formaOferta definida, mostra
  // todas as opções compatíveis com o nome, mas pede confirmação manual.
  const candidatosPorNome = (matrizesTecnicas ?? []).filter(
    (t) => normalizar(t.curso) === normalizar(nomeCurso),
  );
  const matchAutomatico = formaOfertaCurso
    ? candidatosPorNome.find((t) => t.formaOferta === formaOfertaCurso)
    : candidatosPorNome.length === 1
      ? candidatosPorNome[0]
      : undefined;

  const listaParaSelecionar = formaOfertaCurso
    ? (matrizesTecnicas ?? []).filter((t) => t.formaOferta === formaOfertaCurso)
    : (matrizesTecnicas ?? []);

  const [codigoTecnico, setCodigoTecnico] = useState(matchAutomatico?.codigo ?? "");
  const [serieIdxTec, setSerieIdxTec] = useState("");
  const modeloTecnico = (matrizesTecnicas ?? []).find((t) => t.codigo === codigoTecnico);
  const serieTecnica = modeloTecnico?.series[Number(serieIdxTec)];

  const itensParaAplicar = ehTecnico ? serieTecnica?.itens : serieGeral?.itens;
  const serieAnoParaAplicar = ehTecnico ? serieTecnica?.serieAno : serieGeral?.serieAno;

  async function aplicar() {
    if (!itensParaAplicar || !serieAnoParaAplicar) return;
    setAplicando(true);
    let criadas = 0;
    try {
      const itensResolvidos: { disciplinaId: number; categoriaCurricular: string; cargaHorariaSemanal: number; obrigatoria?: boolean }[] = [];

      for (const item of itensParaAplicar) {
        const existente = disciplinas?.find((d) => d.nome.trim().toLowerCase() === item.nome.trim().toLowerCase());
        let disciplinaId: number;
        if (existente) {
          disciplinaId = existente.id;
        } else {
          const criada = await criarDisciplina.mutateAsync({
            data: { nome: item.nome, cargaSemanal: item.cargaHorariaSemanal, categoriaCurricularPadrao: item.categoria as any },
          });
          disciplinaId = criada.id;
          criadas++;
        }
        itensResolvidos.push({
          disciplinaId,
          categoriaCurricular: item.categoria,
          cargaHorariaSemanal: item.cargaHorariaSemanal,
          obrigatoria: "obrigatoria" in item ? (item as any).obrigatoria : true,
        });
      }

      await criarMatriz.mutateAsync({ cursoId, data: { serieAno: serieAnoParaAplicar, itens: itensResolvidos as any } });

      toast({
        title: "Matriz aplicada com sucesso!",
        description: criadas > 0 ? `${criadas} disciplina(s) nova(s) criada(s) automaticamente.` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
      onFechar();
    } catch (err) {
      toast({ title: "Erro ao aplicar modelo", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <Card className="p-6 w-[480px]">
        <h3 className="font-semibold mb-1">Aplicar modelo oficial SEED-PR</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Preenche a matriz inteira automaticamente com as disciplinas e cargas horárias oficiais. Disciplinas que ainda não existem no seu cadastro são criadas sozinhas.
        </p>

        {carregandoModelos ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : ehTecnico ? (
          <div className="space-y-3">
            {!formaOfertaCurso && candidatosPorNome.length > 1 && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Esse curso não tem "Forma de oferta" definida e existe mais de um modelo oficial com esse nome — escolha manualmente o certo abaixo.
              </p>
            )}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Curso técnico (matriz 2026)</label>
              <Select value={codigoTecnico} onValueChange={(v) => { setCodigoTecnico(v); setSerieIdxTec(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o curso técnico" /></SelectTrigger>
                <SelectContent>
                  {listaParaSelecionar.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.curso} — {FORMA_OFERTA_LABEL[t.formaOferta] ?? t.formaOferta} (código {t.codigo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {matchAutomatico && codigoTecnico === matchAutomatico.codigo && (
                <p className="text-[11px] text-green-700 mt-1">✓ Casado automaticamente pelo nome e forma de oferta do curso.</p>
              )}
              {!matchAutomatico && candidatosPorNome.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Não achamos um modelo oficial com esse nome exato — escolha manualmente o curso técnico correspondente, se houver.
                </p>
              )}
            </div>
            {modeloTecnico && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Série / Ano</label>
                <Select value={serieIdxTec} onValueChange={setSerieIdxTec}>
                  <SelectTrigger><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                  <SelectContent>
                    {modeloTecnico.series.map((s, idx) => <SelectItem key={idx} value={String(idx)}>{s.serieAno}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Modalidade</label>
              <Select value={modeloId} onValueChange={(v) => { setModeloId(v); setSerieIdx(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a modalidade" /></SelectTrigger>
                <SelectContent>
                  {templatesGerais.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {modeloGeral && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Série / Ano</label>
                <Select value={serieIdx} onValueChange={setSerieIdx}>
                  <SelectTrigger><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                  <SelectContent>
                    {modeloGeral.series.map((s, idx) => <SelectItem key={idx} value={String(idx)}>{s.serieAno}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {itensParaAplicar && (
          <div className="bg-muted/50 rounded-lg p-3 mt-3">
            <p className="text-xs font-medium mb-2">{itensParaAplicar.length} disciplinas serão adicionadas:</p>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {itensParaAplicar.map((item, i) => (
                <span key={i} className="text-[11px] border rounded px-1.5 py-0.5 bg-background">
                  {item.nome} ({item.cargaHorariaSemanal}h){"obrigatoria" in item && !(item as any).obrigatoria ? " · facultativa" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={aplicar} disabled={!itensParaAplicar || aplicando || carregandoModelos}>
            {aplicando ? "Aplicando..." : "Aplicar modelo"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Edita o código SERE de uma matriz já criada — normalmente a escola
// cadastra a matriz no NexGrade primeiro e só recebe o código do Estado
// depois de registrar no sistema oficial.
function CodigoSereEditor({ cursoId, matriz }: { cursoId: number; matriz: { id: number; codigoMatrizSere?: string | null } }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(matriz.codigoMatrizSere ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const atualizar = useUpdateMatrizCurricular();

  function salvar() {
    atualizar.mutate(
      { cursoId, matrizId: matriz.id, data: { codigoMatrizSere: valor.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Código SERE salvo!" });
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
          setEditando(false);
        },
        onError: () => toast({ title: "Erro ao salvar código", variant: "destructive" }),
      },
    );
  }

  if (!editando) {
    return (
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); setEditando(true); }}
        className="text-xs border rounded px-2.5 py-1 text-muted-foreground hover:bg-muted mr-1"
      >
        {matriz.codigoMatrizSere ? "Editar código SERE" : "+ Código SERE"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1 mr-1" onClick={(e) => e.stopPropagation()}>
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Código SERE"
        className="h-7 w-32 text-xs"
      />
      <Button size="sm" className="h-7 px-2" onClick={salvar} disabled={atualizar.isPending}>
        <Check className="h-3 w-3" />
      </Button>
      <button onClick={() => setEditando(false)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ── Nível 3: Itens da matriz, por categoria ─────────────────────────────────

function ItensDaMatriz({ cursoId, matriz }: { cursoId: number; matriz: { id: number; serieAno: string; itens: any[] } }) {
  const [modalCopiaAberto, setModalCopiaAberto] = useState(false);
  const porCategoria = CATEGORIAS
    .map((sigla) => ({ sigla, itens: matriz.itens.filter((i) => i.categoriaCurricular === sigla) }))
    .filter((g) => g.itens.length > 0);

  return (
    <div className="px-4 pb-4 pt-1 border-t bg-background space-y-4">
      {porCategoria.map((g) => (
        <div key={g.sigla}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{g.sigla}</span>
            <span className="text-xs text-muted-foreground">{CATEGORIA_LABEL[g.sigla]}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.itens.map((item) => <ItemChip key={item.id} cursoId={cursoId} matrizId={matriz.id} item={item} />)}
          </div>
        </div>
      ))}
      {matriz.itens.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma disciplina adicionada ainda.</p>}

      <div className="flex items-center gap-3 pt-1">
        <AdicionarItemForm cursoId={cursoId} matrizId={matriz.id} />
        <button onClick={() => setModalCopiaAberto(true)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
          <Copy className="h-3 w-3" /> Copiar esta grade para outras turmas
        </button>
      </div>

      {modalCopiaAberto && <ModalCopiarMatriz matrizId={matriz.id} onFechar={() => setModalCopiaAberto(false)} />}
    </div>
  );
}

function ItemChip({ cursoId, matrizId, item }: { cursoId: number; matrizId: number; item: { id: number; disciplina?: { nome: string }; cargaHorariaSemanal: number } }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const remover = useRemoverItemMatriz();

  function excluir() {
    remover.mutate(
      { cursoId, matrizId, itemId: item.id },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) }),
        onError: () => toast({ title: "Erro ao remover item", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="group flex items-center gap-2 border rounded px-3 py-1.5 text-sm">
      <span>{item.disciplina?.nome} ({item.cargaHorariaSemanal}h)</span>
      <button onClick={excluir} disabled={remover.isPending} className="opacity-0 group-hover:opacity-100 text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AdicionarItemForm({ cursoId, matrizId }: { cursoId: number; matrizId: number }) {
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState("BNC");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [carga, setCarga] = useState("2");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: disciplinas } = useListDisciplinas();
  const adicionar = useAdicionarItemMatriz();

  const disciplinasFiltradas = disciplinas?.filter(
    (d) => !d.categoriaCurricularPadrao || d.categoriaCurricularPadrao === categoria,
  );

  function trocarCategoria(nova: string) {
    setCategoria(nova);
    setDisciplinaId("");
  }

  function salvar() {
    if (!disciplinaId) return;
    adicionar.mutate(
      { cursoId, matrizId, data: { disciplinaId: Number(disciplinaId), categoriaCurricular: categoria as any, cargaHorariaSemanal: Number(carga) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
          setAberto(false);
          setDisciplinaId("");
        },
        onError: (err) => toast({ title: "Erro ao adicionar disciplina", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="text-xs text-primary font-medium flex items-center gap-1">
        <Plus className="h-3.5 w-3.5" /> Adicionar disciplina
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 pt-2 border-t w-full">
      <div className="w-40">
        <label className="text-[11px] text-muted-foreground block mb-1">Categoria</label>
        <Select value={categoria} onValueChange={trocarCategoria}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="w-52">
        <label className="text-[11px] text-muted-foreground block mb-1">Disciplina</label>
        <Select value={disciplinaId} onValueChange={setDisciplinaId}>
          <SelectTrigger><SelectValue placeholder={disciplinasFiltradas?.length ? "Selecione" : "Nenhuma disponível"} /></SelectTrigger>
          <SelectContent>{disciplinasFiltradas?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">Carga (h)</label>
        <Input type="number" min={1} value={carga} onChange={(e) => setCarga(e.target.value)} className="w-20" />
      </div>
      <Button size="sm" onClick={salvar} disabled={adicionar.isPending || !disciplinaId}>
        <Check className="h-3.5 w-3.5" />
      </Button>
      <button onClick={() => setAberto(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ── Modal: copiar matriz aplicada para outras turmas ────────────────────────

function ModalCopiarMatriz({ matrizId, onFechar }: { matrizId: number; onFechar: () => void }) {
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const [copiando, setCopiando] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: turmas } = useListTurmas();
  const aplicar = useAplicarMatrizTurma();

  async function copiar() {
    setCopiando(true);
    let sucesso = 0;
    for (const turmaId of selecionadas) {
      try {
        await aplicar.mutateAsync({ id: turmaId, data: { matrizCurricularId: matrizId } });
        sucesso++;
      } catch {
        // segue tentando as próximas
      }
    }
    setCopiando(false);
    toast({ title: `Matriz aplicada a ${sucesso} de ${selecionadas.length} turma(s)` });
    queryClient.invalidateQueries({ queryKey: ["turma"] });
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <Card className="p-6 w-96">
        <h3 className="font-semibold mb-4">Aplicar esta matriz às turmas:</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {turmas?.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selecionadas.includes(t.id)}
                onChange={(e) => setSelecionadas(e.target.checked ? [...selecionadas, t.id] : selecionadas.filter((id) => id !== t.id))}
              />
              {t.nome}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={copiar} disabled={selecionadas.length === 0 || copiando}>
            {copiando ? "Aplicando..." : `Aplicar em ${selecionadas.length || 0} turma(s)`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
