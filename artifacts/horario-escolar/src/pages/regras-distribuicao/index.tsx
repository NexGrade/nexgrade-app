import { useState } from "react";
import { Link } from "wouter";
import { useListTurmas, useGetTurma, useUpdateTurma, getGetTurmaQueryKey, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// [LIMITE-DISCIPLINA] (01/11/2026) Tela refeita: (1) o que o gerador sempre respeita, so leitura, com o
// caminho de onde cada coisa se configura; (2) o que a escola ajusta aqui: maximo de aulas por dia de cada
// disciplina (escola toda) e as excecoes por turma. Sai o campo travado "3" e o aviso antigo sobre
// compactacao/janelas (o gerador atual ja reduz janelas sempre).
// [SEM-COMPLEMENTAR] (23/10/2026) Seção "Complementares" (limite diário do professor na turma) retirada
// da tela: o motor CP-SAT não usa esse limite (só o gerador simples antigo). Tabela, rota e dados ficam.

type Regras = {
  padrao: number; minimo: number; maximo: number;
  porDisciplina: Record<string, number>;
  disciplinas: { id: number; nome: string }[];
  excecoes: { turmaId: number; turma: string; turno: string; disciplinaId: number; disciplina: string; limite: number }[];
};
const CHAVE_REGRAS = ["/api/regras-distribuicao"] as const;

const SEMPRE_RESPEITA: { texto: string; onde?: { href: string; rotulo: string } }[] = [
  { texto: "O professor não fica em duas turmas no mesmo horário, e nem a turma com dois professores (salvo trio e co-docência)." },
  { texto: "Os horários bloqueados de cada professor (dias e aulas em que não pode).", onde: { href: "/disponibilidade", rotulo: "Disponibilidade" } },
  { texto: "A hora-atividade pela tabela da SEED-PR.", onde: { href: "/configuracoes/seed-pr", rotulo: "Regras SEED-PR" } },
  { texto: "O professor dá no máximo 3 aulas seguidas na mesma turma (4 nunca)." },
  { texto: "Pausa entre turnos: o professor não emenda o fim de um turno com o começo do outro." },
  { texto: "Sempre tenta deixar o menor número de janelas, para a turma e para o professor." },
  { texto: "Trio, co-docência e aulas assíncronas, como configurados na turma.", onde: { href: "/turmas", rotulo: "Turmas" } },
];

export default function RegrasDistribuicaoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Regras de Distribuição</h1>
        <p className="text-muted-foreground">O que o gerador de horário sempre segue e o que a escola pode ajustar.</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">1. O que o gerador sempre respeita</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Regras da rede, iguais em todas as escolas. Não se alteram aqui.</p>
        <ul className="space-y-2">
          {SEMPRE_RESPEITA.map((r) => (
            <li key={r.texto} className="flex items-start gap-2 text-sm">
              <Lock className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground" />
              <span>
                {r.texto}
                {r.onde && <> <Link href={r.onde.href} className="text-primary underline whitespace-nowrap">Ver em {r.onde.rotulo}</Link></>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 space-y-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">2. O que a escola pode ajustar</h2>
        </div>
        <LimitePorDisciplina />
        <ExcecoesPorTurma />
      </Card>
    </div>
  );
}

function useRegras() {
  return useQuery({ queryKey: CHAVE_REGRAS, queryFn: () => customFetch<Regras>("/api/regras-distribuicao", { responseType: "json" } as any) });
}

function LimitePorDisciplina() {
  const { data, isLoading } = useRegras();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const valorDe = (id: number) => editados[id] ?? (data?.porDisciplina[id] != null ? String(data.porDisciplina[id]) : "");
  const alterados = Object.keys(editados).filter((id) => (editados[id] || "") !== (data?.porDisciplina[id] != null ? String(data.porDisciplina[id]) : ""));

  async function salvar() {
    if (!data) return;
    const limites: Record<string, number | null> = {};
    for (const id of alterados) {
      const t = editados[id].trim();
      if (!t) { limites[id] = null; continue; }
      const n = Number(t);
      if (!Number.isInteger(n) || n < data.minimo || n > data.maximo) {
        toast({ title: `Use um número de ${data.minimo} a ${data.maximo}, ou deixe vazio para o padrão.`, variant: "destructive" });
        return;
      }
      limites[id] = n;
    }
    setSalvando(true);
    try {
      await customFetch("/api/regras-distribuicao/por-disciplina", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limites }),
      });
      setEditados({});
      await queryClient.invalidateQueries({ queryKey: CHAVE_REGRAS });
      toast({ title: "Limites salvos. Valem na próxima geração da grade." });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section>
      <h3 className="font-medium">Máximo de aulas por dia, por disciplina (escola toda)</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Quantas aulas da mesma disciplina a turma pode ter no mesmo dia. Vazio = padrão da rede
        ({data?.padrao ?? 3}). Ex.: Educação Física 1 para espalhar na semana.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {data && data.disciplinas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma disciplina vinculada às turmas ainda.</p>
      )}
      {data && data.disciplinas.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.disciplinas.map((d) => (
              <label key={d.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded px-3 py-2">
                <span className="text-sm truncate" title={d.nome}>{d.nome}</span>
                <Input
                  type="number" min={data.minimo} max={data.maximo} inputMode="numeric"
                  value={valorDe(d.id)} placeholder={String(data.padrao)}
                  onChange={(e) => setEditados((m) => ({ ...m, [d.id]: e.target.value }))}
                  className="w-16 h-8 shrink-0"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Button onClick={salvar} disabled={salvando || alterados.length === 0}>
              {salvando ? "Salvando…" : "Salvar limites"}
            </Button>
            {alterados.length > 0 && <span className="text-xs text-muted-foreground">{alterados.length} alteração(ões) não salva(s)</span>}
          </div>
        </>
      )}
    </section>
  );
}

function ExcecoesPorTurma() {
  const { data } = useRegras();
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
          queryClient.invalidateQueries({ queryKey: CHAVE_REGRAS });
        },
        onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
      },
    );
  }

  async function removerExcecao(e: Regras["excecoes"][number]) {
    try {
      await customFetch(`/api/regras-distribuicao/excecao/${e.turmaId}/${e.disciplinaId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: CHAVE_REGRAS });
      queryClient.invalidateQueries({ queryKey: getGetTurmaQueryKey(e.turmaId) });
      toast({ title: `${e.disciplina} em ${e.turma} volta ao limite da disciplina.` });
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  }

  const padraoDaDisciplina = (id: number) => data?.porDisciplina[id] ?? data?.padrao ?? 3;

  return (
    <section className="border-t pt-5">
      <h3 className="font-medium">Exceções por turma</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Um limite diferente só para uma turma. Vale mais que o limite da disciplina acima.
      </p>

      {data && data.excecoes.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Exceções já configuradas ({data.excecoes.length})</div>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr><th className="px-3 py-1.5 font-medium">Turma</th><th className="px-3 py-1.5 font-medium">Disciplina</th><th className="px-3 py-1.5 font-medium text-right">Máx./dia</th><th className="px-3 py-1.5" /></tr>
              </thead>
              <tbody>
                {data.excecoes.map((e) => (
                  <tr key={`${e.turmaId}-${e.disciplinaId}`} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setTurmaId(String(e.turmaId))}>
                    <td className="px-3 py-1.5">{e.turma}</td>
                    <td className="px-3 py-1.5">{e.disciplina}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{e.limite}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-destructive"
                        onClick={(ev) => { ev.stopPropagation(); removerExcecao(e); }}>Remover</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Clique numa linha para abrir a turma abaixo.</p>
        </div>
      )}
      {data && data.excecoes.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3">Nenhuma exceção configurada: todas as turmas seguem o limite da disciplina.</p>
      )}

      <Select value={turmaId} onValueChange={setTurmaId}>
        <SelectTrigger className="w-64 max-w-full"><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
        <SelectContent>{turmas?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
      </Select>

      <div className="space-y-2 mt-3">
        {turma?.disciplinasComCarga?.map((d) => (
          <div key={`${turmaId}-${d.disciplinaId}`} className="flex items-center justify-between gap-2 bg-muted/50 rounded px-3 py-2">
            <span className="text-sm">{d.nome}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">máx./dia:</span>
              <Input
                type="number" min={1} max={6}
                defaultValue={d.maxAulasConsecutivasDia ?? ""}
                placeholder={String(padraoDaDisciplina(d.disciplinaId))}
                className="w-16 h-8"
                onBlur={(e) => e.target.value && salvarLimite(d.disciplinaId, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
      {turmaId && turma?.disciplinasComCarga?.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">Esta turma ainda não tem disciplinas vinculadas.</p>
      )}
    </section>
  );
}
