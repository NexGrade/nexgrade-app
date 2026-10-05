import {
  useListTurmas, useCreateTurma, useUpdateTurma, useDeleteTurma, getListTurmasQueryKey,
  useListDisciplinas, useListCursos, useListMatrizesCurriculares, getListMatrizesCurricularesQueryKey,
  useAplicarMatrizTurma, useGetMatrizCurricularPorId, getGetMatrizCurricularPorIdQueryKey,
  useGetTurma, getGetTurmaQueryKey, useListProfessores, customFetch, // [PROF-DISCIPLINA]
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, GraduationCap, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select"; // [PROF-DISCIPLINA]
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useListaFiltrada } from "@/hooks/use-lista-filtrada";
import { CampoBusca } from "@/components/campo-busca";

const turmaSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório"),
  serie: z.string().min(1, "A série é obrigatória"),
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  anoLetivo: z.coerce.number().min(2000).max(2100),
  disciplinaIds: z.array(z.number()).optional(),
});
type TurmaFormValues = z.infer<typeof turmaSchema>;

// [REVEZAMENTO-TRIO] mesma conta do backend (lib/revezamento-trio.ts): semanas
// corridas a partir da semana do inicio; ordem 1, 2, 3 e repete.
function segundaUTC(d: Date) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; }
function ordemPresencialTrio(inicio: string, data: Date) {
  const s = Math.round((segundaUTC(data).getTime() - segundaUTC(new Date(`${inicio}T12:00:00Z`)).getTime()) / (7 * 86_400_000));
  return (((s % 3) + 3) % 3) + 1;
}
function segundaDestaSemanaISO() { return segundaUTC(new Date(Date.now() - 3 * 3_600_000)).toISOString().slice(0, 10); }

// [PROF-DISCIPLINA] [MONTAR-TURMA] Montagem da turma num lugar so: professor de
// cada disciplina, co-docencia (2o professor), trio e aulas assincronas.
// Tudo grava na hora, pelas rotas ja existentes de turmas.
function ProfessoresPorDisciplina({ turmaId }: { turmaId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: turma, isLoading } = useGetTurma(turmaId, { query: { queryKey: getGetTurmaQueryKey(turmaId) } });
  const { data: professores = [] } = useListProfessores();
  const [salvando, setSalvando] = useState<string | null>(null);
  const [abrirCodoc, setAbrirCodoc] = useState<number | null>(null);
  const [criandoTrio, setCriandoTrio] = useState(false); // [CRIAR-TRIO]
  const [selTrio, setSelTrio] = useState<number[]>([]);
  const linhas = ((turma as any)?.disciplinasComCarga ?? []) as any[];

  // agrupa as linhas por disciplina (co-docencia = 2 linhas da mesma disciplina)
  const grupos: Array<{ disciplinaId: number; nome: string; carga: number; linhas: any[]; trio: string; assinc: number; trioOrdem: number | null; trioInicio: string | null }> = [];
  for (const l of linhas) {
    let g = grupos.find((x) => x.disciplinaId === l.disciplinaId);
    if (!g) {
      g = { disciplinaId: l.disciplinaId, nome: l.nome, carga: l.cargaHorariaSemanal, linhas: [], trio: (l.grupoTrio ?? "").trim(), assinc: l.aulasAssincronas ?? 0, trioOrdem: l.trioOrdem ?? null, trioInicio: l.trioInicio ?? null };
      grupos.push(g);
    }
    g.linhas.push(l);
  }
  const semProfessor = linhas.filter((l) => !l.professorId).length;

  // avisos de trio: cada rotulo precisa de exatamente 3 disciplinas, com a mesma carga
  const trios = new Map<string, Array<{ nome: string; carga: number }>>();
  for (const g of grupos) if (g.trio) trios.set(g.trio, [...(trios.get(g.trio) ?? []), { nome: g.nome, carga: g.carga }]);
  const avisosTrio: string[] = [];
  for (const [rotulo, ds] of trios) {
    if (ds.length !== 3) avisosTrio.push(`Trio "${rotulo}" tem ${ds.length} disciplina(s) — precisa de exatamente 3.`);
    else if (new Set(ds.map((d) => d.carga)).size > 1) avisosTrio.push(`Trio "${rotulo}" com cargas diferentes: ${ds.map((d) => `${d.nome} ${d.carga}h`).join(", ")} — precisam ser iguais.`);
  }

  // [CRIAR-TRIO] rotulo automatico (A, B, C...) e validacao: 3 disciplinas, mesma carga, com professor
  const letrasUsadas = new Set(grupos.map((g) => g.trio).filter(Boolean));
  const proximaLetra = ["A", "B", "C", "D", "E", "F", "G", "H"].find((l) => !letrasUsadas.has(l)) ?? `T${letrasUsadas.size + 1}`;
  const selecionados = grupos.filter((g) => selTrio.includes(g.disciplinaId));
  const cargasSel = new Set(selecionados.map((g) => g.carga));
  const todosComProfessor = selecionados.every((g) => g.linhas.every((l) => l.professorId));
  const trioValido = selecionados.length === 3 && cargasSel.size === 1 && todosComProfessor;
  async function confirmarTrio() {
    if (!trioValido) return;
    const letra = proximaLetra;
    const inicio = segundaDestaSemanaISO(); // [REVEZAMENTO-TRIO] ja nasce com o revezamento: ordem da selecao, a partir desta semana
    for (const [i, g] of selecionados.entries()) {
      await chamar(`/api/turmas/${turmaId}/disciplinas/${g.disciplinaId}/modalidade`, "PATCH", { grupoTrio: letra, trioOrdem: i + 1, trioInicio: inicio }, `Trio ${letra}: ${g.nome}`);
    }
    setCriandoTrio(false);
    setSelTrio([]);
  }
  async function salvarInicioTrio(gs: Array<{ disciplinaId: number }>, rotulo: string, v: string) { // [REVEZAMENTO-INICIO-SALVA]
    for (const g of gs) await chamar(`/api/turmas/${turmaId}/disciplinas/${g.disciplinaId}/modalidade`, "PATCH", { trioInicio: v }, `Trio ${rotulo}: semana 1 = ${v.split("-").reverse().join("/")}`);
  }
  async function desfazerTrio(rotulo: string) {
    if (!confirm(`Desfazer o trio ${rotulo}? As disciplinas voltam a ser independentes.`)) return;
    for (const g of grupos.filter((x) => x.trio === rotulo)) {
      await chamar(`/api/turmas/${turmaId}/disciplinas/${g.disciplinaId}/modalidade`, "PATCH", { grupoTrio: null }, `${g.nome} saiu do trio ${rotulo}`);
    }
  }
  async function chamar(url: string, method: string, body: unknown, msg: string) {
    setSalvando(url);
    try {
      await customFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await queryClient.invalidateQueries({ queryKey: getGetTurmaQueryKey(turmaId) });
      toast({ title: msg });
    } catch (err) {
      toast({ title: "Não foi possível salvar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSalvando(null);
    }
  }

  const semEnter = (e: any) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } };

  function seletor(disciplinaId: number, valor: number | null, onEscolher: (v: string) => void, permitirRemover: boolean, chave: string) {
    const ativos = professores.filter((p) => p.ativo !== false);
    const habilitados = ativos.filter((p) => (p.disciplinaIds ?? []).includes(disciplinaId));
    const outros = ativos.filter((p) => !(p.disciplinaIds ?? []).includes(disciplinaId));
    return (
      <Select key={chave} value={valor ? String(valor) : ""} onValueChange={onEscolher} disabled={salvando !== null}>
        <SelectTrigger className="w-60 h-8"><SelectValue placeholder="Escolher professor" /></SelectTrigger>
        <SelectContent>
          {habilitados.length > 0 && (
            <SelectGroup>
              <SelectLabel>Habilitados nesta disciplina</SelectLabel>
              {habilitados.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>Outros professores</SelectLabel>
            {outros.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
          </SelectGroup>
          {permitirRemover && <SelectItem value="__nenhum__">— remover professor —</SelectItem>}
        </SelectContent>
      </Select>
    );
  }

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (grupos.length === 0) return null;
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Professores, co-docência e trio</p>
        {semProfessor > 0
          ? <span className="text-xs font-medium text-amber-700">{semProfessor} sem professor</span>
          : <span className="text-xs font-medium text-emerald-700">todas distribuídas</span>}
      </div>
      {avisosTrio.length > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5">
          {avisosTrio.map((a) => <p key={a}>{a}</p>)}
        </div>
      )}
      <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 space-y-2">{/* [CRIAR-TRIO] */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-violet-900">Trios</p>
          {!criandoTrio && (
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={salvando !== null} onClick={() => { setCriandoTrio(true); setSelTrio([]); }}>+ Criar trio</Button>
          )}
        </div>
        {trios.size === 0 && !criandoTrio && (
          <p className="text-xs text-muted-foreground">Nenhum trio nesta turma. Trio = 3 disciplinas, cada uma com seu professor, sempre no mesmo dia e horário.</p>
        )}
        {[...trios.keys()].map((rotulo) => {
          const gs = grupos.filter((g) => g.trio === rotulo);
          const inicio = gs[0]?.trioInicio ?? "";
          const ordens = gs.map((g) => g.trioOrdem);
          const revezOk = !!inicio && gs.length === 3 && new Set(ordens).size === 3 && ordens.every((o) => o != null && o >= 1 && o <= 3);
          const presente = revezOk ? gs.find((g) => g.trioOrdem === ordemPresencialTrio(inicio, new Date(Date.now() - 3 * 3_600_000))) : undefined;
          const urlMod = (g: { disciplinaId: number }) => `/api/turmas/${turmaId}/disciplinas/${g.disciplinaId}/modalidade`;
          return (
          <div key={rotulo} className="text-sm bg-background rounded px-2 py-1.5 border space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span>
                <strong>Trio {rotulo}:</strong>{" "}
                {gs.map((g) => `${g.nome} (${g.linhas.map((l) => l.professorNome ?? "sem professor").join(" + ")})`).join(" · ")}
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive shrink-0" disabled={salvando !== null} onClick={() => desfazerTrio(rotulo)}>desfazer</Button>
            </div>
            {/* [REVEZAMENTO-TRIO] cada semana um professor presencial, os outros 2 em suporte */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-violet-900">Revezamento semanal:</span>
              <label className="flex items-center gap-1">semana 1 começa em
                <Input key={`ini-${rotulo}-${inicio}`} type="date" defaultValue={inicio} className="h-7 w-36" disabled={salvando !== null} onKeyDown={semEnter}
                  onChange={(e) => { const v = e.target.value; if (/^20\d\d-\d\d-\d\d$/.test(v) && v !== inicio) void salvarInicioTrio(gs, rotulo, v); }} />
              </label>
              {/* [REVEZAMENTO-INICIO-SALVA] grava na hora (antes so no blur e a data se perdia) + atalho */}
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={salvando !== null}
                onClick={() => salvarInicioTrio(gs, rotulo, segundaDestaSemanaISO())}>esta semana é a 1</Button>
              {gs.map((g) => (
                <label key={g.disciplinaId} className="flex items-center gap-1">{g.nome}:
                  <select className="h-7 rounded border bg-background px-1" value={g.trioOrdem ?? ""} disabled={salvando !== null}
                    onChange={(e) => chamar(urlMod(g), "PATCH", { trioOrdem: e.target.value ? Number(e.target.value) : null }, `${g.nome}: ${e.target.value ? e.target.value + "ª semana" : "sem ordem"} do revezamento`)}>
                    <option value="">—</option><option value="1">1ª semana</option><option value="2">2ª semana</option><option value="3">3ª semana</option>
                  </select>
                </label>
              ))}
              {revezOk
                ? <span className="font-semibold text-emerald-700">Esta semana: presencial {presente?.linhas.map((l) => l.professorNome).join(" + ") ?? "?"} ({presente?.nome})</span>
                : <span className="text-amber-700">Defina a data de início e uma semana diferente (1ª, 2ª, 3ª) para cada disciplina.</span>}
            </div>
          </div>
          );
        })}
        {criandoTrio && (
          <div className="bg-background rounded border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Marque as <strong>3 disciplinas</strong> do trio {proximaLetra} — mesma carga semanal, cada uma já com professor:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {grupos.filter((g) => !g.trio).map((g) => {
                const marcado = selTrio.includes(g.disciplinaId);
                const bloqueado = !marcado && selTrio.length >= 3;
                return (
                  <label key={g.disciplinaId} className={`flex items-start gap-2 text-sm rounded px-2 py-1 ${bloqueado ? "opacity-50" : "hover:bg-muted/50 cursor-pointer"}`}>
                    <Checkbox className="mt-0.5" checked={marcado} disabled={bloqueado}
                      onCheckedChange={(c) => setSelTrio((s) => (c === true ? [...s, g.disciplinaId] : s.filter((x) => x !== g.disciplinaId)))} />
                    <span>{g.nome} <span className="text-muted-foreground">({g.carga}h · {g.linhas[0]?.professorNome ?? "sem professor"})</span></span>
                  </label>
                );
              })}
            </div>
            {selecionados.length === 3 && cargasSel.size > 1 && (
              <p className="text-xs text-rose-600">As 3 disciplinas precisam ter a mesma carga semanal.</p>
            )}
            {selecionados.length > 0 && !todosComProfessor && (
              <p className="text-xs text-rose-600">Defina o professor de cada disciplina antes de criar o trio.</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => { setCriandoTrio(false); setSelTrio([]); }}>Cancelar</Button>
              <Button type="button" size="sm" disabled={!trioValido || salvando !== null} onClick={confirmarTrio}>Criar trio {proximaLetra} ({selecionados.length}/3)</Button>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {grupos.map((g) => {
          const urlModalidade = `/api/turmas/${turmaId}/disciplinas/${g.disciplinaId}/modalidade`;
          const faltaProfessor = g.linhas.some((l) => !l.professorId);
          return (
            <div key={g.disciplinaId} className={`rounded-md border p-3 space-y-2 ${faltaProfessor ? "bg-amber-50/70 border-amber-200" : "bg-muted/30"}`}>
              <p className="text-sm font-medium leading-snug">
                {g.nome} <span className="text-muted-foreground font-normal">({g.carga}h)</span>
                {g.linhas.length > 1 && <span className="ml-2 text-[11px] font-semibold rounded bg-blue-100 text-blue-800 px-1.5 py-0.5">co-docência</span>}
                {g.trio && <span className="ml-2 text-[11px] font-semibold rounded bg-violet-100 text-violet-800 px-1.5 py-0.5">trio {g.trio}</span>}
                {g.assinc > 0 && <span className="ml-2 text-[11px] font-semibold rounded bg-slate-200 text-slate-800 px-1.5 py-0.5">{g.assinc} assíncrona(s)</span>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {g.linhas.map((l, i) => (
                  <div key={l.turmaDisciplinaId} className="flex items-center gap-1">
                    {seletor(g.disciplinaId, l.professorId ?? null,
                      (v) => chamar(`/api/turmas/${turmaId}/disciplinas/linha/${l.turmaDisciplinaId}`, "PATCH", { professorId: v === "__nenhum__" ? null : Number(v) }, v === "__nenhum__" ? "Professor removido" : "Professor definido"),
                      !!l.professorId && i === 0 && g.linhas.length === 1, `prof-${l.turmaDisciplinaId}`)}
                    {i > 0 && (
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" disabled={salvando !== null}
                        onClick={() => { if (confirm(`Remover o 2º professor de ${g.nome}? A disciplina continua com o 1º professor.`)) chamar(`/api/turmas/${turmaId}/disciplinas/linha/${l.turmaDisciplinaId}`, "DELETE", undefined, "Co-docência removida"); }}>
                        remover
                      </Button>
                    )}
                  </div>
                ))}
                {g.linhas.length === 1 && (abrirCodoc === g.disciplinaId
                  ? seletor(g.disciplinaId, null, (v) => { setAbrirCodoc(null); chamar(`/api/turmas/${turmaId}/disciplinas/${g.disciplinaId}/dupla`, "POST", { professorId: Number(v) }, "Co-docência criada"); }, false, `codoc-${g.disciplinaId}`)
                  : <Button type="button" size="sm" variant="outline" className="h-8" disabled={!g.linhas[0]?.professorId || salvando !== null} onClick={() => setAbrirCodoc(g.disciplinaId)} title="Dois professores dando a mesma aula juntos">+ co-docência</Button>)}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <label className="flex items-center gap-1.5">Assíncronas/sem.:
                  <Input key={`assinc-${g.disciplinaId}-${g.assinc}`} type="number" min={0} max={20} defaultValue={g.assinc} className="w-16 h-7" onKeyDown={semEnter}
                    onBlur={(e) => { const v = Number(e.target.value || 0); if (v !== g.assinc) chamar(urlModalidade, "PATCH", { aulasAssincronas: v }, "Aulas assíncronas atualizadas"); }} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tudo grava na hora. <strong>Co-docência:</strong> dois professores dando a mesma aula juntos. <strong>Trio:</strong> use "Criar trio" e marque as 3 disciplinas que acontecem juntas (mesma carga, cada uma com seu professor). <strong>Assíncronas:</strong> quantas das aulas semanais da disciplina são assíncronas.
      </p>
    </div>
  );
}
export default function TurmasList() {
  const { data: turmas, isLoading } = useListTurmas();
  const { busca, setBusca, itensFiltrados: turmasFiltradas } = useListaFiltrada(turmas, (t) => t.nome);
  const deleteTurma = useDeleteTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleOpenCreate = () => { setEditingId(null); setIsDialogOpen(true); };
  const handleOpenEdit = (turma: any) => { setEditingId(turma.id); setIsDialogOpen(true); };

  const handleDelete = (id: number) => {
    deleteTurma.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Turma removida" });
          queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
        },
        onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
      },
    );
  };

  const turnoLabels: Record<string, string> = { matutino: "Matutino", vespertino: "Vespertino", noturno: "Noturno" };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Turmas</h1>
          <p className="text-muted-foreground">Gerencie as turmas e suas grades curriculares.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}><Plus className="mr-2 h-4 w-4" />Nova Turma</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-3xl">{/* [TURMA-DIALOGO-ROLAGEM] */}
            {isDialogOpen && (
              <TurmaForm
                key={editingId ?? "nova-turma"}
                editingId={editingId} onCriada={(id: number) => setEditingId(id)}
                turmaAtual={editingId ? turmas?.find((t) => t.id === editingId) : undefined}
                onFechar={() => setIsDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <CampoBusca
        value={busca}
        onChange={setBusca}
        placeholder="Buscar turma por nome..."
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : turmas?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma turma cadastrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie as turmas para começar a montar os horários.</p>
        </div>
      ) : turmasFiltradas.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Nenhuma turma encontrada para "{busca}".</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {turmasFiltradas.map((turma) => (
            <Card key={turma.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{turma.nome}</h3>
                      <Badge variant="outline">{turnoLabels[turma.turno]}</Badge>
                      <Badge variant="secondary">{turma.anoLetivo}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Série: {turma.serie} • {(turma.disciplinaIds || []).length} disciplinas
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/horario?tab=grade&turma=${turma.id}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                      <CalendarDays className="mr-2 h-4 w-4" />Horário
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(turma)}><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover turma?</AlertDialogTitle>
                          <AlertDialogDescription>Isso removerá a turma e todo o seu horário. Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(turma.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Formulário (criar/editar), com integração Curso > Matriz ───────────

function TurmaForm({ editingId, turmaAtual, onFechar, onCriada }: { editingId: number | null; turmaAtual: any; onFechar: () => void; onCriada?: (id: number) => void }) {
  const { data: disciplinas } = useListDisciplinas();
  const { data: cursos } = useListCursos();
  // [FIX 03/09 v2 -- causa raiz corrigida] Antes, o valor da matriz ja
  // aplicada era copiado pra estado local via useEffect -- isso cria
  // uma janela entre o efeito rodar e o proximo render onde outro
  // evento pode interromper o processo, perdendo o valor (confirmado
  // com logs: matrizId chegava a virar "520" e sozinho voltava pra "").
  // Agora os valores exibidos sao DERIVADOS a cada renderizacao: usam
  // o override do usuario quando ele mexeu manualmente, senao usam o
  // valor vindo da matriz ja aplicada a turma. Sem efeito, sem janela
  // de corrida, sem essa classe de bug.
  const [nivelOverride, setNivel] = useState<string | null>(null);
  const [cursoIdOverride, setCursoId] = useState<string | null>(null);
  const [matrizIdOverride, setMatrizId] = useState<string | null>(null);
  const matrizJaAplicadaId = turmaAtual?.matrizCurricularId ?? undefined;
  const { data: matrizDaTurma } = useGetMatrizCurricularPorId(
    matrizJaAplicadaId ?? 0,
    { query: { enabled: !!matrizJaAplicadaId, queryKey: getGetMatrizCurricularPorIdQueryKey(matrizJaAplicadaId ?? 0) } },
  );
  const nivel = nivelOverride ?? matrizDaTurma?.nivel ?? "";
  const cursoId = cursoIdOverride ?? (matrizDaTurma ? String(matrizDaTurma.cursoId) : "");
  const matrizId = matrizIdOverride ?? (matrizDaTurma ? String(matrizDaTurma.id) : "");
  const cursosOfertados = cursos?.filter((c: any) => c.ofertado !== false || String(c.id) === cursoId); // [CATALOGO]
  const cursosFiltrados = nivel ? cursosOfertados?.filter((c) => c.nivel === nivel) : cursosOfertados;
  const { data: matrizes } = useListMatrizesCurriculares(
    Number(cursoId),
    { query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(Number(cursoId)) } },
  );
  const matrizSelecionada = matrizes?.find((m) => m.id === Number(matrizId));

  const createTurma = useCreateTurma();
  const updateTurma = useUpdateTurma();
  const aplicarMatriz = useAplicarMatrizTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<TurmaFormValues>({
    resolver: zodResolver(turmaSchema),
    defaultValues: {
      nome: turmaAtual?.nome ?? "",
      serie: turmaAtual?.serie ?? "",
      turno: (turmaAtual?.turno as any) ?? "matutino",
      anoLetivo: turmaAtual?.anoLetivo ?? new Date().getFullYear(),
      disciplinaIds: turmaAtual?.disciplinaIds ?? [],
    },
  });

  function selecionarMatriz(id: string) {
    // [FIX 03/09 v3 -- causa raiz real] O Select de Serie/Matriz e
    // disabled={!cursoId} -- quando cursoId passa a ter valor (matriz
    // ja aplicada carregando), o Select "liga" e dispara
    // onValueChange("") sozinho nesse instante, chamando esta funcao
    // com id vazio e zerando o matrizId bem na hora que tinha acabado
    // de ser preenchido certo. Uma selecao de verdade do usuario
    // sempre manda um id real -- ignora chamadas com id vazio.
    if (!id) return;
    setMatrizId(id);
    const m = matrizes?.find((mm) => mm.id === Number(id));
    if (m) form.setValue("serie", m.serieAno, { shouldValidate: true });
  }

  async function onSubmit(data: TurmaFormValues) {
    try {
      let turmaId = editingId;
      // [FIX 03/09] Se a turma ja tinha uma matriz aplicada e o usuario
      // NAO trocou de matriz nesta sessao (Nivel/Curso/Serie continuam
      // vazios, que e o estado padrao ao abrir o formulario), NAO manda
      // disciplinaIds -- evita que o backend desvincule a matriz por
      // engano em qualquer edicao trivial (RF-TUR-02/03 em turmas.ts so
      // deveria disparar numa edicao manual de verdade, nao como efeito
      // colateral de abrir e salvar o formulario sem mexer em nada).
      const matrizJaAplicadaSemTroca = !matrizId && !!turmaAtual?.matrizCurricularId;
      const omitirDisciplinaIds = !!matrizId || matrizJaAplicadaSemTroca;
      if (editingId) {
        await updateTurma.mutateAsync({ id: editingId, data: omitirDisciplinaIds ? { ...data, disciplinaIds: undefined } : data });
      } else {
        const nova = await createTurma.mutateAsync({ data: matrizId ? { ...data, disciplinaIds: undefined } : data });
        turmaId = nova.id;
      }
      // [MATRIZ-SO-SE-TROCOU] So reaplica a matriz se o usuario escolheu uma matriz
      // DIFERENTE da ja aplicada. Antes reaplicava em todo "Salvar" (o campo vem
      // preenchido com a matriz atual) e isso refazia os vinculos da turma.
      const trocouMatriz = !!matrizIdOverride && matrizIdOverride !== (matrizJaAplicadaId ? String(matrizJaAplicadaId) : "");
      if (trocouMatriz && turmaId) {
        await aplicarMatriz.mutateAsync({ id: turmaId, data: { matrizCurricularId: Number(matrizId) } });
      }
      queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
      // [NOVA-TURMA-CONTINUA] turma nova: nao fecha -- passa para a edicao e mostra a distribuicao
      if (!editingId && turmaId && onCriada) {
        toast({ title: "Turma criada! Agora distribua os professores, co-docência e trios." });
        onCriada(turmaId);
        return;
      }
      toast({ title: editingId ? "Turma atualizada com sucesso!" : "Turma criada com sucesso!" });
      onFechar();
    } catch {
      toast({ title: "Erro ao salvar turma", variant: "destructive" });
    }
  }

  const salvando = createTurma.isPending || updateTurma.isPending || aplicarMatriz.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editingId ? "Editar Turma" : "Nova Turma"}</DialogTitle>
        <DialogDescription>
          {editingId ? "Altere os dados da turma abaixo." : "Escolha o curso e a matriz curricular — as disciplinas e cargas horárias vêm preenchidas automaticamente."}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">Curso e Matriz Curricular (recomendado)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nível</label>
                <Select value={nivel} onValueChange={(v) => { if (!v) return; setNivel(v); setCursoId(""); setMatrizId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fundamental">Ensino Fundamental</SelectItem>
                    <SelectItem value="medio">Ensino Médio</SelectItem>
                    <SelectItem value="tecnico">Técnico / Profissionalizante</SelectItem>
                    <SelectItem value="normal_magisterio">Formação de Docentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Curso</label>
                <Select value={cursoId} onValueChange={(v) => { if (!v) return; setCursoId(v); setMatrizId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o curso" /></SelectTrigger>
                  <SelectContent>
                    {cursosFiltrados?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Série / Matriz</label>
                <Select value={matrizId} onValueChange={selecionarMatriz} disabled={!cursoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                  <SelectContent>
                    {matrizes?.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.serieAno} ({m.cargaHorariaSemanalTotal}h/semana)</SelectItem>)}
                  </SelectContent>
                </Select>
                {cursoId && matrizes && matrizes.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Este curso ainda não tem matriz cadastrada. Vá em <strong>Cursos</strong>, expanda "{cursos?.find((c) => c.id === Number(cursoId))?.nome}" e crie uma matriz primeiro.
                  </p>
                )}
              </div>
            </div>
            {matrizSelecionada && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Disciplinas desta matriz (aplicadas automaticamente):</p>
                <div className="flex flex-wrap gap-1.5">
                  {matrizSelecionada.itens.map((item: any) => (
                    <span key={item.id} className="text-xs border rounded px-2 py-1 bg-background">
                      {item.disciplina?.nome} ({item.cargaHorariaSemanal}h)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {editingId && <ProfessoresPorDisciplina turmaId={editingId} />}{/* [PROF-DISCIPLINA] */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da Turma</FormLabel>
                <FormControl><Input placeholder="Ex: 1º Ano A" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="serie" render={({ field }) => (
              <FormItem>
                <FormLabel>Série / Ano{matrizId && <span className="font-normal text-muted-foreground"> (preenchido pela matriz)</span>}</FormLabel>
                <FormControl><Input placeholder="Ex: 1º Ano do Ensino Médio" {...field} readOnly={!!matrizId} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="turno" render={({ field }) => (
              <FormItem>
                <FormLabel>Turno</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione um turno" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="matutino">Matutino</SelectItem>
                    <SelectItem value="vespertino">Vespertino</SelectItem>
                    <SelectItem value="noturno">Noturno</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="anoLetivo" render={({ field }) => (
              <FormItem>
                <FormLabel>Ano Letivo</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {!matrizId && (
            <FormField
              control={form.control}
              name="disciplinaIds"
              render={() => (
                <FormItem>
                  <div className="mb-2">
                    <FormLabel className="text-base">Disciplinas da Turma (manual)</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Sem curso/matriz selecionado acima — marque as disciplinas manualmente.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto p-1">
                    {disciplinas?.map((disciplina) => (
                      <FormField
                        key={disciplina.id}
                        control={form.control}
                        name="disciplinaIds"
                        render={({ field }) => {
                          const value = field.value || [];
                          return (
                            <FormItem key={disciplina.id} className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                              <FormControl>
                                <Checkbox
                                  checked={value.includes(disciplina.id)}
                                  onCheckedChange={(checked) => checked
                                    ? field.onChange([...value, disciplina.id])
                                    : field.onChange(value.filter((v) => v !== disciplina.id))}
                                />
                              </FormControl>
                              <FormLabel className="font-medium cursor-pointer">{disciplina.nome}</FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar Turma"}</Button>
          </div>
        </form>
      </Form>
    </>
  );
}
