// [MODO-RASCUNHO] (06/11/2026) Grade do rascunho na aba Grade (com o rascunho ligado): escolher a turma, ver a grade
// dela no rascunho e trocar aulas clicando em duas (ou numa e num vago). Avisa choque antes de trocar.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListTurmas, useListDisciplinas, useListProfessores } from "@workspace/api-client-react";
import { SeletorBusca } from "@/components/seletor-busca";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Linha = { id: number; nome: string; turmaId: number; disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number; assincrona?: boolean };
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

export function GradeRascunho({ nome, turmaInicial }: { nome: string; turmaInicial?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: turmas = [] } = useListTurmas();
  const { data: disciplinas = [] } = useListDisciplinas();
  const { data: professores = [] } = useListProfessores();
  const [turmaId, setTurmaId] = useState<string>(turmaInicial && turmaInicial !== "all" ? turmaInicial : "");
  const chave = ["grade-rascunho", nome, turmaId];
  const q = useQuery({
    queryKey: chave,
    queryFn: () => customFetch<Linha[]>(`/api/horarios/experimentais?turmaId=${turmaId}`),
    enabled: !!turmaId,
  });
  const linhas = useMemo(() => (q.data ?? []).filter((l) => l.nome === nome), [q.data, nome]);
  const [sel, setSel] = useState<{ diaSemana: number; numeroAula: number } | null>(null);
  const [trocando, setTrocando] = useState(false);
  const maxAula = Math.max(5, ...linhas.map((l) => l.numeroAula));

  const clicar = async (diaSemana: number, numeroAula: number) => {
    if (trocando) return;
    if (!sel) { setSel({ diaSemana, numeroAula }); return; }
    if (sel.diaSemana === diaSemana && sel.numeroAula === numeroAula) { setSel(null); return; }
    const corpo = { turmaId: Number(turmaId), de: sel, para: { diaSemana, numeroAula } };
    const url = `/api/horarios/experimentais/${encodeURIComponent(nome)}/trocar-aulas`;
    setTrocando(true);
    try {
      let r = await customFetch<{ aplicado: boolean; avisos: string[] }>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.aplicado) {
        if (!confirm(`Atenção:\n\n${r.avisos.map((a) => `• ${a}`).join("\n")}\n\nTrocar mesmo assim?`)) return;
        r = await customFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, confirmar: true }) });
      }
      await qc.invalidateQueries({ queryKey: ["grade-rascunho", nome] });
      await qc.invalidateQueries({ queryKey: ["rascunho"] });
      toast({ title: "Aulas trocadas no rascunho", description: `${DIAS[sel.diaSemana]} ${sel.numeroAula}ª ↔ ${DIAS[diaSemana]} ${numeroAula}ª. A escola não mudou.` });
    } catch (e) {
      toast({ title: "Não foi possível trocar", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSel(null);
      setTrocando(false);
    }
  };

  const nomeProf = (id: number) => professores.find((p) => p.id === id)?.nome ?? "?";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SeletorBusca
          className="w-64"
          options={[...turmas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })).map((t) => ({ value: String(t.id), label: t.nome }))}
          value={turmaId}
          onChange={(v) => { setTurmaId(v); setSel(null); }}
          placeholder="Escolha a turma"
          buscarPlaceholder="Buscar turma..."
        />
        <p className="text-xs text-muted-foreground flex-1">
          Para trocar: clique numa aula (ou num horário vago) e depois em outra. Para gerar de novo com o motor, use a aba Modo Experimental (o nome do rascunho já vem preenchido).
        </p>
      </div>
      {!turmaId && <p className="text-sm text-muted-foreground">Escolha uma turma para ver a grade dela no rascunho.</p>}
      {turmaId && q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>}
      {turmaId && !q.isLoading && (
        <div className="border border-violet-200 rounded-lg overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-6 border-b border-violet-200 bg-violet-50/60">
              <div className="p-2 text-xs font-medium text-muted-foreground text-center border-r border-violet-100">Aula</div>
              {DIAS.map((d) => <div key={d} className="p-2 text-xs font-semibold text-center border-r border-violet-100 last:border-0">{d}</div>)}
            </div>
            {Array.from({ length: maxAula }, (_, i) => i + 1).map((aula) => (
              <div key={aula} className="grid grid-cols-6 border-b border-violet-100 last:border-0">
                <div className="p-2 flex items-center justify-center text-xs font-medium text-muted-foreground border-r border-violet-100 bg-violet-50/30">{aula}ª</div>
                {DIAS.map((_, dia) => {
                  const aqui = linhas.filter((l) => l.diaSemana === dia && l.numeroAula === aula);
                  const marcada = sel?.diaSemana === dia && sel?.numeroAula === aula;
                  const disc = aqui[0] ? disciplinas.find((d) => d.id === aqui[0]!.disciplinaId) : undefined;
                  return (
                    <button key={dia} type="button" disabled={trocando} onClick={() => void clicar(dia, aula)}
                      className={`p-1 min-h-[54px] border-r border-violet-100 last:border-0 text-left ${marcada ? "ring-2 ring-inset ring-violet-500 bg-violet-50" : "hover:bg-violet-50/50"}`}>
                      {aqui.length ? (
                        <div className="h-full rounded p-1.5 border-l-4 text-[10px] leading-tight" style={{ backgroundColor: `${disc?.cor ?? "#8E24AA"}15`, borderLeftColor: disc?.cor ?? "#8E24AA" }}>
                          <div className="font-semibold truncate">{disc?.nome ?? "?"}{aqui.some((l) => l.assincrona) ? " (assíncrona)" : ""}</div>
                          <div className="text-muted-foreground truncate">{aqui.map((l) => nomeProf(l.professorId)).join(" + ")}</div>
                        </div>
                      ) : <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground/40">Vago</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
