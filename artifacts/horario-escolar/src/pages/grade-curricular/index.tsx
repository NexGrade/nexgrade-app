import { useState } from "react";
import {
  useListCursos, useListMatrizesCurriculares, getListMatrizesCurricularesQueryKey,
  useAdicionarItemMatriz, useRemoverItemMatriz,
  useListDisciplinas, useListTurmas, useAplicarMatrizTurma,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Copy, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

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
const CATEGORIAS = Object.keys(CATEGORIA_LABEL);

export default function GradeCurricularPage() {
  const [cursoId, setCursoId] = useState<string>("");
  const [matrizAberta, setMatrizAberta] = useState<number | null>(null);
  const [modalCopiaMatrizId, setModalCopiaMatrizId] = useState<number | null>(null);

  const { data: cursos, isLoading: carregandoCursos } = useListCursos();
  const { data: matrizes, isLoading: carregandoMatrizes } = useListMatrizesCurriculares(
    Number(cursoId),
    { query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(Number(cursoId)) } },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Grade Curricular</h1>
        <p className="text-muted-foreground">Disciplinas e cargas horárias por matriz curricular.</p>
      </div>

      <Select value={cursoId} onValueChange={(v) => { setCursoId(v); setMatrizAberta(null); }}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder={carregandoCursos ? "Carregando..." : "Selecione o curso"} />
        </SelectTrigger>
        <SelectContent>
          {cursos?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
        </SelectContent>
      </Select>

      {!cursoId ? null : carregandoMatrizes ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-3">
          {matrizes?.map((matriz) => {
            const isOpen = matrizAberta === matriz.id;
            const porCategoria = CATEGORIAS
              .map((sigla) => ({ sigla, itens: matriz.itens.filter((i) => i.categoriaCurricular === sigla) }))
              .filter((g) => g.itens.length > 0);

            return (
              <Card key={matriz.id} className="overflow-hidden">
                <button
                  onClick={() => setMatrizAberta(isOpen ? null : matriz.id)}
                  className={`w-full flex justify-between items-center px-5 py-4 text-left ${isOpen ? "bg-muted/30" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold">{matriz.serieAno}</span>
                    <span className="text-xs text-muted-foreground">({matriz.cargaHorariaSemanalTotal}h/semana)</span>
                  </div>
                  {isOpen && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setModalCopiaMatrizId(matriz.id); }}
                      className="text-xs border rounded px-3 py-1.5 flex items-center gap-1.5 hover:bg-muted"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar para outras turmas
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 space-y-4">
                    {porCategoria.map((g) => (
                      <div key={g.sigla}>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{g.sigla}</span>
                          <span className="text-xs text-muted-foreground">{CATEGORIA_LABEL[g.sigla]}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.itens.map((item) => (
                            <ItemChip key={item.id} cursoId={Number(cursoId)} matrizId={matriz.id} item={item} />
                          ))}
                        </div>
                      </div>
                    ))}
                    <AdicionarItemForm cursoId={Number(cursoId)} matrizId={matriz.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modalCopiaMatrizId != null && (
        <ModalCopiarMatriz matrizId={modalCopiaMatrizId} onFechar={() => setModalCopiaMatrizId(null)} />
      )}
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
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMatrizesCurricularesQueryKey(cursoId) });
        },
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
  const [disciplinaId, setDisciplinaId] = useState("");
  const [categoria, setCategoria] = useState("BNC");
  const [carga, setCarga] = useState("2");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: disciplinas } = useListDisciplinas();
  const adicionar = useAdicionarItemMatriz();

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
      <button onClick={() => setAberto(true)} className="text-xs text-primary font-medium flex items-center gap-1 mt-2">
        <Plus className="h-3.5 w-3.5" /> Adicionar disciplina
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 mt-2 pt-3 border-t">
      <div className="w-48">
        <Select value={disciplinaId} onValueChange={setDisciplinaId}>
          <SelectTrigger><SelectValue placeholder="Disciplina" /></SelectTrigger>
          <SelectContent>{disciplinas?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="w-40">
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Input type="number" min={1} value={carga} onChange={(e) => setCarga(e.target.value)} className="w-20" />
      <Button size="sm" onClick={salvar} disabled={adicionar.isPending || !disciplinaId}>
        <Check className="h-3.5 w-3.5" />
      </Button>
      <button onClick={() => setAberto(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

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
        // segue tentando as próximas turmas mesmo se uma falhar
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
        <h3 className="font-semibold mb-4">Copiar grade para:</h3>
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
            {copiando ? "Copiando..." : `Copiar para ${selecionadas.length || 0} turma(s)`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
