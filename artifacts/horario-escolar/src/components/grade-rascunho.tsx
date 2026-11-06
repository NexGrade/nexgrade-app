// [MODO-RASCUNHO] (06/11/2026) Grade do rascunho na aba Grade (com o rascunho ligado): escolher o periodo e a turma (ou
// todas as turmas do periodo), ver a grade no rascunho e trocar aulas clicando em duas (ou numa e num vago). Avisa
// choque antes de trocar. [RASCUNHO-TROCAR-PROFESSOR] lapis na aula troca o professor da disciplina na turma.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListTurmas, useListDisciplinas, useListProfessores } from "@workspace/api-client-react";
import { SeletorBusca } from "@/components/seletor-busca";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Linha = { id: number; nome: string; turmaId: number; disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number; assincrona?: boolean };
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
// [RASCUNHO-TROCAR-PROFESSOR] (06/11/2026) linha da atribuicao do rascunho (professor de cada disciplina da turma)
type Atrib = { turmaDisciplinaId: number; turmaId: number; disciplinaId: number; disciplina: string; turma: string; professorOficialId: number | null; professorId: number | null; mudou: boolean; credenciados?: number[] };
const SEM = "__sem__";
const TODAS = "todas";
// [RASCUNHO-POR-PERIODO] (06/11/2026) pedido da dona: escolher o periodo e ver todas as turmas dele
const PERIODOS = [{ v: "matutino", r: "Manhã" }, { v: "vespertino", r: "Tarde" }, { v: "noturno", r: "Noite" }, { v: "integral", r: "Integral" }];

export function GradeRascunho({ nome }: { nome: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: turmas = [] } = useListTurmas();
  const { data: disciplinas = [] } = useListDisciplinas();
  const { data: professores = [] } = useListProfessores();
  const periodosDaEscola = PERIODOS.filter((p) => turmas.some((t) => t.turno === p.v));
  const [periodoEscolhido, setPeriodo] = useState<string | null>(null);
  const periodo = periodoEscolhido ?? periodosDaEscola[0]?.v ?? "matutino";
  const [turmaSel, setTurmaSel] = useState<string>("");
  const turmasDoPeriodo = useMemo(() => [...turmas].filter((t) => t.turno === periodo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })), [turmas, periodo]);
  const mostrar = turmaSel === TODAS ? turmasDoPeriodo : turmasDoPeriodo.filter((t) => String(t.id) === turmaSel);

  const q = useQuery({
    queryKey: ["grade-rascunho", nome],
    queryFn: () => customFetch<Linha[]>("/api/horarios/experimentais"),
  });
  const linhasRascunho = useMemo(() => (q.data ?? []).filter((l) => l.nome === nome), [q.data, nome]);
  const [sel, setSel] = useState<{ turmaId: number; diaSemana: number; numeroAula: number } | null>(null);
  const [trocando, setTrocando] = useState(false);

  // lapis na aula: trocar o professor da disciplina na turma (so no rascunho)
  const atribQ = useQuery({
    queryKey: ["atribuicoes-exp", nome],
    queryFn: () => customFetch<Atrib[]>(`/api/horarios/experimentais/${encodeURIComponent(nome)}/atribuicoes`),
  });
  const [editando, setEditando] = useState<{ turmaId: number; disciplinaId: number } | null>(null);
  const [escolha, setEscolha] = useState<Record<number, string>>({});
  const [soCredenciados, setSoCredenciados] = useState(true);
  const [salvandoProf, setSalvandoProf] = useState(false);
  const linhasAtrib = editando ? (atribQ.data ?? []).filter((a) => a.turmaId === editando.turmaId && a.disciplinaId === editando.disciplinaId) : [];
  const abrirEdicao = (turmaId: number, disciplinaId: number) => {
    const ls = (atribQ.data ?? []).filter((a) => a.turmaId === turmaId && a.disciplinaId === disciplinaId);
    setEscolha(Object.fromEntries(ls.map((a) => [a.turmaDisciplinaId, a.professorId != null ? String(a.professorId) : SEM])));
    setSoCredenciados(true);
    setEditando({ turmaId, disciplinaId });
  };
  const salvarProfessor = async () => {
    setSalvandoProf(true);
    try {
      let mudou = 0;
      for (const a of linhasAtrib) {
        const v = escolha[a.turmaDisciplinaId];
        if (v == null || v === SEM) continue;
        const novo = Number(v);
        if (novo === a.professorId) continue;
        await customFetch(`/api/horarios/experimentais/${encodeURIComponent(nome)}/atribuicoes`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turmaDisciplinaId: a.turmaDisciplinaId, professorId: novo }),
        });
        mudou++;
      }
      await qc.invalidateQueries({ queryKey: ["atribuicoes-exp", nome] });
      await qc.invalidateQueries({ queryKey: ["grade-rascunho", nome] });
      await qc.invalidateQueries({ queryKey: ["rascunho"] });
      setEditando(null);
      if (mudou) toast({ title: "Professor trocado no rascunho", description: "Vale para todas as aulas dessa disciplina na turma. A escola não mudou." });
    } catch (e) {
      toast({ title: "Não foi possível trocar o professor", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setSalvandoProf(false); }
  };

  const clicar = async (turmaId: number, diaSemana: number, numeroAula: number) => {
    if (trocando) return;
    if (!sel || sel.turmaId !== turmaId) { setSel({ turmaId, diaSemana, numeroAula }); return; }
    if (sel.diaSemana === diaSemana && sel.numeroAula === numeroAula) { setSel(null); return; }
    const corpo = { turmaId, de: { diaSemana: sel.diaSemana, numeroAula: sel.numeroAula }, para: { diaSemana, numeroAula } };
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

  const gradeDaTurma = (turma: { id: number; nome: string }) => {
    const linhas = linhasRascunho.filter((l) => l.turmaId === turma.id);
    const maxAula = Math.max(5, ...linhas.map((l) => l.numeroAula));
    return (
      <div key={turma.id} className="space-y-1">
        {turmaSel === TODAS && <p className="text-sm font-semibold">{turma.nome}</p>}
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
                  const marcada = sel?.turmaId === turma.id && sel.diaSemana === dia && sel.numeroAula === aula;
                  const disc = aqui[0] ? disciplinas.find((d) => d.id === aqui[0]!.disciplinaId) : undefined;
                  return (
                    <div key={dia} role="button" tabIndex={0} aria-disabled={trocando}
                      onClick={() => void clicar(turma.id, dia, aula)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void clicar(turma.id, dia, aula); } }}
                      className={cn("group relative p-1 min-h-[54px] border-r border-violet-100 last:border-0 text-left cursor-pointer", marcada ? "ring-2 ring-inset ring-violet-500 bg-violet-50" : "hover:bg-violet-50/50")}>
                      {aqui.length ? (
                        <div className="h-full rounded p-1.5 pr-6 border-l-4 text-[10px] leading-tight" style={{ backgroundColor: `${disc?.cor ?? "#8E24AA"}15`, borderLeftColor: disc?.cor ?? "#8E24AA" }}>
                          <div className="font-semibold truncate">{disc?.nome ?? "?"}{aqui.some((l) => l.assincrona) ? " (assíncrona)" : ""}</div>
                          <div className="text-muted-foreground truncate">{aqui.map((l) => nomeProf(l.professorId)).join(" + ")}</div>
                        </div>
                      ) : <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground/40">Vago</span>}
                      {aqui[0] && (
                        <button type="button" title="Trocar o professor desta disciplina na turma (só no rascunho)" aria-label="Trocar professor"
                          onClick={(e) => { e.stopPropagation(); abrirEdicao(turma.id, aqui[0]!.disciplinaId); }}
                          className="absolute top-1.5 right-1.5 rounded p-1 bg-white/80 text-violet-700 opacity-60 group-hover:opacity-100 hover:bg-violet-100">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* [RASCUNHO-POR-PERIODO] */}
        <div className="flex rounded-md border overflow-hidden" role="group" aria-label="Período">
          {periodosDaEscola.map((p) => (
            <button key={p.v} type="button" onClick={() => { setPeriodo(p.v); setTurmaSel(""); setSel(null); }} aria-pressed={periodo === p.v}
              className={cn("px-3 h-9 text-sm font-medium", periodo === p.v ? "bg-violet-700 text-white" : "bg-background hover:bg-accent")}>
              {p.r}
            </button>
          ))}
        </div>
        <SeletorBusca
          className="w-64"
          options={[{ value: TODAS, label: `Todas as turmas (${turmasDoPeriodo.length})` }, ...turmasDoPeriodo.map((t) => ({ value: String(t.id), label: t.nome }))]}
          value={turmaSel}
          onChange={(v) => { setTurmaSel(v); setSel(null); }}
          placeholder="Escolha a turma"
          buscarPlaceholder="Buscar turma..."
        />
        <p className="text-xs text-muted-foreground flex-1 min-w-[14rem]">
          Trocar de lugar: clique numa aula (ou num horário vago) e depois em outra da mesma turma. Trocar o professor: lápis na aula. Gerar de novo com o motor: aba Modo Experimental (o nome do rascunho já vem preenchido).
        </p>
      </div>
      {!turmaSel && <p className="text-sm text-muted-foreground">Escolha uma turma do período ou "Todas as turmas".</p>}
      {turmaSel && q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>}
      {turmaSel && !q.isLoading && <div className="space-y-5">{mostrar.map(gradeDaTurma)}</div>}

      <Dialog open={!!editando} onOpenChange={(v) => { if (!v) setEditando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Professor de {linhasAtrib[0]?.disciplina ?? "disciplina"} · {linhasAtrib[0]?.turma ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Tira o professor atual e põe o escolhido em <strong>todas as aulas</strong> desta disciplina nesta turma, só no rascunho.</p>
            {atribQ.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>}
            {!atribQ.isLoading && !linhasAtrib.length && <p className="text-destructive">Esta disciplina não está ligada à turma (Turmas → disciplinas).</p>}
            {linhasAtrib.map((a, i) => (
              <div key={a.turmaDisciplinaId} className="space-y-1">
                {linhasAtrib.length > 1 && <p className="text-xs font-medium">{i === 0 ? "1º professor" : "2º professor (co-docência)"}</p>}
                <Select value={escolha[a.turmaDisciplinaId] ?? SEM} onValueChange={(v) => setEscolha((e) => ({ ...e, [a.turmaDisciplinaId]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Escolha o professor" /></SelectTrigger>
                  <SelectContent>
                    {professores
                      .filter((p) => (p.ativo !== false || p.id === a.professorId) && (!soCredenciados || p.id === a.professorId || (a.credenciados ?? []).includes(p.id)))
                      .map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {a.mudou && <p className="text-xs text-muted-foreground">Na escola: {a.professorOficialId != null ? nomeProf(a.professorOficialId) : "sem professor"}</p>}
              </div>
            ))}
            <label className="flex items-center gap-2 cursor-pointer select-none w-fit text-xs">
              <input type="checkbox" className="accent-primary" checked={soCredenciados} onChange={(e) => setSoCredenciados(e.target.checked)} />
              Só professores credenciados para a disciplina
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button disabled={salvandoProf || !linhasAtrib.length} onClick={() => void salvarProfessor()}>{salvandoProf && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar no rascunho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
