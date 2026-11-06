// [EXPERIMENTO-COMPLETO] (06/11/2026) Aba "Atribuição" dentro do experimento: trocar quem dá cada disciplina de cada
// turma só no experimento (como em Turmas → professor da disciplina). As aulas do experimento dessa disciplina passam
// para o professor novo; gerar/melhorar usam a atribuição do experimento e o Promover aplica na oficial.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorBusca } from "@/components/seletor-busca";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type LinhaAtribuicao = {
  turmaDisciplinaId: number; turmaId: number; turma: string; turno: string; disciplinaId: number; disciplina: string;
  professorOficialId: number | null; professorId: number | null; mudou: boolean;
};
const SEM = "__sem__";

export function AtribuicaoExperimento({ nome, professores, turmaInicial }: {
  nome: string; professores: Array<{ id: number; nome: string; ativo?: boolean | null }>; turmaInicial?: number | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const chave = ["atribuicoes-exp", nome];
  const q = useQuery({ queryKey: chave, queryFn: () => customFetch<LinhaAtribuicao[]>(`/api/horarios/experimentais/${encodeURIComponent(nome)}/atribuicoes`) });
  const linhas = q.data ?? [];
  const turmas = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of linhas) m.set(l.turmaId, l.turma);
    return [...m.entries()].map(([id, n]) => ({ id, nome: n }));
  }, [linhas]);
  const mudadas = linhas.filter((l) => l.mudou);
  const [turmaId, setTurmaId] = useState<string>(turmaInicial ? String(turmaInicial) : "");
  const [salvando, setSalvando] = useState<number | null>(null);
  const nomeProf = (id: number | null) => (id == null ? "Sem professor" : professores.find((p) => p.id === id)?.nome ?? `#${id}`);
  const daTurma = linhas.filter((l) => String(l.turmaId) === turmaId);

  const atribuir = async (l: LinhaAtribuicao, professorId: number | null) => {
    setSalvando(l.turmaDisciplinaId);
    try {
      const r = await customFetch<{ aulasAtualizadas: number }>(`/api/horarios/experimentais/${encodeURIComponent(nome)}/atribuicoes`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turmaDisciplinaId: l.turmaDisciplinaId, professorId }),
      });
      await qc.invalidateQueries({ queryKey: chave });
      await qc.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      await qc.invalidateQueries({ queryKey: ["experimentos-resumo"] });
      toast({
        title: `${l.disciplina} (${l.turma}): ${nomeProf(professorId)}`,
        description: professorId === l.professorOficialId ? "Voltou à atribuição oficial." : `Só neste experimento.${r.aulasAtualizadas ? ` ${r.aulasAtualizadas} aula(s) do experimento passaram para o novo professor.` : ""}`,
      });
    } catch (e) {
      toast({ title: "Não foi possível trocar o professor", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSalvando(null);
    }
  };

  if (q.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando a atribuição...</div>;
  if (q.isError) return <div className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Não foi possível carregar a atribuição."}</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Troque quem dá cada disciplina <strong>só neste experimento</strong>. As aulas já geradas dessa disciplina passam para o professor novo;
        ao gerar ou melhorar de novo, o motor usa esta atribuição. A oficial só muda ao promover.
      </p>
      {mudadas.length > 0 && (
        <div className="rounded-md border border-purple-200 bg-purple-50/50 p-2.5 text-xs space-y-0.5">
          <p className="font-medium text-purple-900">Mudanças neste experimento ({mudadas.length})</p>
          {mudadas.map((l) => (
            <div key={l.turmaDisciplinaId}>
              <button type="button" className="underline" onClick={() => setTurmaId(String(l.turmaId))}>{l.turma}</button> · {l.disciplina}:{" "}
              <span className="text-muted-foreground line-through">{nomeProf(l.professorOficialId)}</span> → <strong>{nomeProf(l.professorId)}</strong>
            </div>
          ))}
        </div>
      )}
      <SeletorBusca
        className="max-w-xs"
        options={turmas.map((t) => ({ value: String(t.id), label: t.nome + (mudadas.some((m) => m.turmaId === t.id) ? " •" : "") }))}
        value={turmaId}
        onChange={setTurmaId}
        placeholder="Escolha a turma"
        buscarPlaceholder="Buscar turma..."
      />
      {turmaId && (
        <div className="divide-y rounded-md border">
          {daTurma.map((l) => (
            <div key={l.turmaDisciplinaId} className={cn("flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center", l.mudou && "bg-purple-50/60")}>
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium">{l.disciplina}</div>
                {l.mudou && <div className="text-xs text-muted-foreground">Oficial: {nomeProf(l.professorOficialId)}</div>}
              </div>
              <div className="flex items-center gap-2">
                {l.mudou && <Badge variant="outline" className="border-purple-300 text-purple-800">no experimento</Badge>}
                <Select value={l.professorId != null ? String(l.professorId) : SEM} disabled={salvando !== null}
                  onValueChange={(v) => atribuir(l, v === SEM ? null : Number(v))}>
                  <SelectTrigger className="h-9 w-60 max-w-full">{salvando === l.turmaDisciplinaId ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue />}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem professor</SelectItem>
                    {professores.filter((p) => p.ativo !== false || p.id === l.professorId).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {l.mudou && (
                  <button type="button" title="Voltar à atribuição oficial" className="text-muted-foreground hover:text-foreground" disabled={salvando !== null}
                    onClick={() => atribuir(l, l.professorOficialId)}>
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!daTurma.length && <p className="p-3 text-sm text-muted-foreground">Esta turma não tem disciplinas.</p>}
        </div>
      )}
    </div>
  );
}
