import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCursos,
  useListMatrizesCurriculares,
  useCreateMatrizCurricular,
  useDeleteMatrizCurricular,
  useListDisciplinas,
  getListMatrizesCurricularesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Library } from "lucide-react";
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

// RF-CUR-02/03/05: matriz curricular = uma série/ano de um curso, com
// disciplinas + carga horária semanal + categoria curricular. Categoria
// usa nomenclatura própria do NexGrade (ver docs/analise-formatos-uranin-sere.md
// — não reproduz a "Composição Curricular" nem qualquer taxonomia do
// SERE ou de produtos de terceiros, embora cubra o mesmo espaço de dado
// público quando aplicável).
const CATEGORIAS: { value: string; label: string }[] = [
  { value: "base_nacional_comum", label: "Base Nacional Comum" },
  { value: "parte_diversificada", label: "Parte Diversificada" },
  { value: "formacao_geral_basica", label: "Formação Geral Básica" },
  { value: "itinerario_formativo", label: "Itinerário Formativo" },
  { value: "itinerario_profissionalizante", label: "Itinerário Profissionalizante" },
  { value: "aprofundamento_pratica", label: "Aprofundamento / Prática" },
  { value: "parte_flexivel", label: "Parte Flexível" },
];

type ItemRascunho = {
  disciplinaId: number | null;
  categoriaCurricular: string;
  cargaHorariaSemanal: number;
  grupoDisciplina: string;
  obrigatoria: boolean;
};

function novoItemRascunho(): ItemRascunho {
  return { disciplinaId: null, categoriaCurricular: "base_nacional_comum", cargaHorariaSemanal: 2, grupoDisciplina: "", obrigatoria: true };
}

export default function CursoMatrizCurricular() {
  const { id } = useParams();
  const cursoId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cursos } = useListCursos();
  const curso = useMemo(() => cursos?.find((c) => c.id === cursoId), [cursos, cursoId]);

  const { data: matrizes, isLoading } = useListMatrizesCurriculares(cursoId, {
    query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(cursoId) },
  });
  const { data: disciplinas } = useListDisciplinas();
  const criarMatriz = useCreateMatrizCurricular();
  const removerMatriz = useDeleteMatrizCurricular();

  const [serieAno, setSerieAno] = useState("");
  const [itens, setItens] = useState<ItemRascunho[]>([novoItemRascunho()]);

  const cargaTotal = itens.reduce((soma, i) => soma + (i.cargaHorariaSemanal || 0), 0);

  function atualizarItem(index: number, patch: Partial<ItemRascunho>) {
    setItens((atual) => atual.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function adicionarLinha() {
    setItens((atual) => [...atual, novoItemRascunho()]);
  }

  function removerLinha(index: number) {
    setItens((atual) => atual.filter((_, i) => i !== index));
  }

  function salvarMatriz() {
    if (!serieAno.trim()) {
      toast({ title: "Informe a série/ano", variant: "destructive" });
      return;
    }
    const itensValidos = itens.filter((i) => i.disciplinaId != null);
    if (itensValidos.length === 0) {
      toast({ title: "Adicione ao menos uma disciplina", variant: "destructive" });
      return;
    }

    criarMatriz.mutate(
      {
        cursoId,
        data: {
          serieAno: serieAno.trim(),
          itens: itensValidos.map((i) => ({
            disciplinaId: i.disciplinaId as number,
            categoriaCurricular: i.categoriaCurricular as any,
            cargaHorariaSemanal: i.cargaHorariaSemanal,
            grupoDisciplina: i.grupoDisciplina.trim() || undefined,
            obrigatoria: i.obrigatoria,
          })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Matriz curricular criada!" });
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
          setSerieAno("");
          setItens([novoItemRascunho()]);
        },
        onError: () => toast({ title: "Erro ao criar matriz curricular", variant: "destructive" }),
      },
    );
  }

  function excluirMatriz(matrizId: number) {
    removerMatriz.mutate(
      { cursoId, matrizId },
      {
        onSuccess: () => {
          toast({ title: "Matriz curricular removida" });
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
        },
        onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <Link href="/cursos">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Cursos
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{curso?.nome ?? "Matriz Curricular"}</h1>
        <p className="text-muted-foreground">
          Cada série/ano tem sua própria lista de disciplinas, carga horária semanal e categoria curricular.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova Matriz (Série/Ano)</CardTitle>
          <CardDescription>Ex.: "6º Ano", "1ª Série".</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <label className="text-sm font-medium">Série/Ano</label>
            <Input value={serieAno} onChange={(e) => setSerieAno(e.target.value)} placeholder="Ex.: 1ª Série" />
          </div>

          <div className="space-y-3">
            {itens.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-md p-3">
                <div className="md:col-span-4">
                  <label className="text-xs text-muted-foreground">Disciplina</label>
                  <Select
                    value={item.disciplinaId != null ? String(item.disciplinaId) : undefined}
                    onValueChange={(v) => atualizarItem(index, { disciplinaId: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {disciplinas?.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-muted-foreground">Categoria curricular</label>
                  <Select
                    value={item.categoriaCurricular}
                    onValueChange={(v) => atualizarItem(index, { categoriaCurricular: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">C.H. semanal</label>
                  <Input
                    type="number"
                    min={1}
                    value={item.cargaHorariaSemanal}
                    onChange={(e) => atualizarItem(index, { cargaHorariaSemanal: Number(e.target.value) || 1 })}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Grupo (opcional)</label>
                  <Input
                    value={item.grupoDisciplina}
                    onChange={(e) => atualizarItem(index, { grupoDisciplina: e.target.value })}
                    placeholder="Ex.: Língua Estrangeira"
                  />
                </div>

                <div className="md:col-span-1 flex items-center gap-2">
                  <Checkbox
                    checked={item.obrigatoria}
                    onCheckedChange={(checked) => atualizarItem(index, { obrigatoria: !!checked })}
                  />
                  <span className="text-xs text-muted-foreground">Obrigatória</span>
                </div>

                <div className="md:col-span-12 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removerLinha(index)} disabled={itens.length === 1}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={adicionarLinha}>
                <Plus className="w-4 h-4 mr-1" />
                Adicionar disciplina
              </Button>
              <span className="text-sm text-muted-foreground">Carga horária semanal total: {cargaTotal}</span>
            </div>
            <Button onClick={salvarMatriz} disabled={criarMatriz.isPending}>
              {criarMatriz.isPending ? "Salvando..." : "Salvar Matriz"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Matrizes cadastradas</h2>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : matrizes && matrizes.length > 0 ? (
          matrizes.map((matriz) => (
            <Card key={matriz.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{matriz.serieAno}</CardTitle>
                  <CardDescription>Carga horária semanal total: {matriz.cargaHorariaSemanalTotal}</CardDescription>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover matriz "{matriz.serieAno}"?</AlertDialogTitle>
                      <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => excluirMatriz(matriz.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {matriz.itens.map((item) => (
                    <div key={item.id} className="py-2 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.disciplina?.nome ?? `Disciplina #${item.disciplinaId}`}</span>
                        <Badge variant="outline">
                          {CATEGORIAS.find((c) => c.value === item.categoriaCurricular)?.label ?? item.categoriaCurricular}
                        </Badge>
                        {item.grupoDisciplina && <Badge variant="secondary">{item.grupoDisciplina}</Badge>}
                        {!item.obrigatoria && <Badge variant="secondary">Optativa</Badge>}
                      </div>
                      <span className="text-muted-foreground">{item.cargaHorariaSemanal}h/semana</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
              <Library className="w-8 h-8 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma matriz curricular cadastrada para este curso ainda.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
