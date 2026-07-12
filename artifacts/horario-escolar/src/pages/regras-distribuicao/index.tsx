import { useState } from "react";
import {
  useGetConfiguracao, useUpsertConfiguracao, getGetConfiguracaoQueryKey,
  useListTurmas, useGetTurma, useUpdateTurma, getGetTurmaQueryKey,
  useListProfessores, useListLimitesDiariosProfessor, useSetLimiteDiarioProfessor,
  getListLimitesDiariosProfessorQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CHAVE_MAX_GEMINADAS = "seed_pr.max_aulas_geminadas_padrao";

export default function RegrasDistribuicaoPage() {
  const [aberto, setAberto] = useState<"geral" | "especifico" | "complementar" | null>("geral");

  const secoes = [
    { key: "geral" as const, titulo: "Tipos gerais", subtitulo: "Regra padrão para toda a escola" },
    { key: "especifico" as const, titulo: "Tipos específicos", subtitulo: "Por disciplina/turma — sobrescreve o geral" },
    { key: "complementar" as const, titulo: "Complementares", subtitulo: "Professor com múltiplas disciplinas na mesma turma" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Regras de Distribuição</h1>
        <p className="text-muted-foreground">Como o gerador de horário aplica cada regra, em camadas.</p>
      </div>

      <div className="space-y-3">
        {secoes.map((s, i) => {
          const isOpen = aberto === s.key;
          return (
            <Card key={s.key} className="overflow-hidden">
              <button
                onClick={() => setAberto(isOpen ? null : s.key)}
                className={`w-full flex justify-between items-center px-5 py-4 text-left ${isOpen ? "bg-muted/30" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <div className="font-semibold">{i + 1}. {s.titulo}</div>
                    <div className="text-xs text-muted-foreground">{s.subtitulo}</div>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="px-5 pb-5">
                  {s.key === "geral" && <SecaoGeral />}
                  {s.key === "especifico" && <SecaoEspecifico />}
                  {s.key === "complementar" && <SecaoComplementar />}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SecaoGeral() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetConfiguracao(CHAVE_MAX_GEMINADAS, {
    query: { queryKey: getGetConfiguracaoQueryKey(CHAVE_MAX_GEMINADAS), retry: false },
  });
  const [valor, setValor] = useState("2");
  const salvar = useUpsertConfiguracao();

  const valorAtual = typeof config?.valor === "number" ? config.valor : Number(valor);

  function salvarValor() {
    salvar.mutate(
      { chave: CHAVE_MAX_GEMINADAS, data: { valor: Number(valor), descricao: "Máximo de aulas geminadas por padrão, quando a disciplina/turma não tem override específico." } },
      {
        onSuccess: () => {
          toast({ title: "Padrão salvo!" });
          queryClient.invalidateQueries({ queryKey: getGetConfiguracaoQueryKey(CHAVE_MAX_GEMINADAS) });
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="pt-2">
      <div className="bg-muted/50 rounded-lg p-4">
        <label className="text-sm font-medium block mb-1">Máximo de aulas geminadas (padrão da escola)</label>
        <p className="text-xs text-muted-foreground mb-3">
          Vale para toda disciplina/turma que não tiver um limite específico configurado na seção abaixo.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={6}
            defaultValue={isLoading ? undefined : valorAtual}
            onChange={(e) => setValor(e.target.value)}
            className="w-24"
          />
          <Button size="sm" onClick={salvarValor} disabled={salvar.isPending}>
            <Check className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>
        </div>
      </div>
      <p className="text-xs text-amber-600 mt-3">
        Compactação de carga horária e bloqueio de janelas ainda não têm um padrão configurável aqui — hoje são escolhidos a cada geração de horário, na tela de Horário/Esquema.
      </p>
    </div>
  );
}

function SecaoEspecifico() {
  const [turmaId, setTurmaId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: turmas } = useListTurmas();
  const { data: turma } = useGetTurma(Number(turmaId), { query: { enabled: !!turmaId, queryKey: getGetTurmaQueryKey(Number(turmaId)) } });
  const atualizar = useUpdateTurma();

  function salvarLimite(disciplinaId: number, valor: string) {
    const numero = Number(valor);
    if (!numero || numero < 1) return;
    atualizar.mutate(
      { id: Number(turmaId), data: { disciplinasConfig: { [disciplinaId]: { maxAulasConsecutivasDia: numero } } } },
      {
        onSuccess: () => {
          toast({ title: "Limite salvo!" });
          queryClient.invalidateQueries({ queryKey: getGetTurmaQueryKey(Number(turmaId)) });
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="pt-2 space-y-4">
      <Select value={turmaId} onValueChange={setTurmaId}>
        <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
        <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
      </Select>

      {turma?.disciplinasComCarga?.map((d) => (
        <div key={d.disciplinaId} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
          <span className="text-sm">{d.nome}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">máx. geminadas/dia:</span>
            <Input
              type="number" min={1} max={6}
              defaultValue={d.maxAulasConsecutivasDia ?? ""}
              placeholder="padrão"
              className="w-16 h-8"
              onBlur={(e) => e.target.value && salvarLimite(d.disciplinaId, e.target.value)}
            />
          </div>
        </div>
      ))}
      {turmaId && turma?.disciplinasComCarga?.length === 0 && (
        <p className="text-xs text-muted-foreground">Esta turma ainda não tem disciplinas vinculadas.</p>
      )}
    </div>
  );
}

function SecaoComplementar() {
  const [aberto, setAberto] = useState(false);
  const [professorId, setProfessorId] = useState("");
  const [turmaId, setTurmaId] = useState<string>("");
  const [maxAulas, setMaxAulas] = useState("2");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: professores } = useListProfessores();
  const { data: turmas } = useListTurmas();
  const { data: limites } = useListLimitesDiariosProfessor(undefined, { query: { queryKey: getListLimitesDiariosProfessorQueryKey() } });
  const salvar = useSetLimiteDiarioProfessor();

  function salvarLimite() {
    if (!professorId) return;
    salvar.mutate(
      { data: { professorId: Number(professorId), turmaId: turmaId ? Number(turmaId) : null, maxAulasPorDia: Number(maxAulas) } },
      {
        onSuccess: () => {
          toast({ title: "Limite salvo!" });
          queryClient.invalidateQueries({ queryKey: getListLimitesDiariosProfessorQueryKey() });
          setAberto(false);
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  function nomeProfessor(id: number) {
    return professores?.find((p) => p.id === id)?.nome ?? `#${id}`;
  }
  function nomeTurma(id: number | null) {
    if (id === null) return "Qualquer turma (padrão do professor)";
    return turmas?.find((t) => t.id === id)?.nome ?? `#${id}`;
  }

  return (
    <div className="pt-2 space-y-2">
      {limites?.map((l) => (
        <div key={l.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-sm">
          <span>{nomeProfessor(l.professorId)}</span>
          <span className="text-xs text-muted-foreground">{nomeTurma(l.turmaId ?? null)} · máx. {l.maxAulasPorDia}/dia</span>
        </div>
      ))}

      {!aberto ? (
        <button onClick={() => setAberto(true)} className="text-xs text-primary font-medium flex items-center gap-1 mt-2">
          <Plus className="h-3.5 w-3.5" /> Adicionar regra
        </button>
      ) : (
        <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t">
          <div className="w-48">
            <label className="text-xs text-muted-foreground block mb-1">Professor</label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger><SelectValue placeholder="Professor" /></SelectTrigger>
              <SelectContent>{professores?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <label className="text-xs text-muted-foreground block mb-1">Turma (opcional)</label>
            <Select value={turmaId} onValueChange={setTurmaId}>
              <SelectTrigger><SelectValue placeholder="Qualquer turma" /></SelectTrigger>
              <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Máx./dia</label>
            <Input type="number" min={1} value={maxAulas} onChange={(e) => setMaxAulas(e.target.value)} className="w-20" />
          </div>
          <Button size="sm" onClick={salvarLimite} disabled={salvar.isPending || !professorId}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

