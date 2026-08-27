import { useGetTurma, useGetTurmaHorario, getGetTurmaHorarioQueryKey, useListCursos, useListMatrizesCurriculares, getListMatrizesCurricularesQueryKey, useAplicarMatrizTurma, getGetTurmaQueryKey, useListProfessores, customFetch } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Settings2, Users, X, Plus, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const turnosMap: Record<string, string> = { matutino: "Matutino", vespertino: "Vespertino", noturno: "Noturno" };

// Mostra só o primeiro nome do professor nas células compactas da
// grade (mesma convenção do Urania) -- o nome completo continua nos
// selects/dropdowns, só aqui no grid é abreviado. Quando existe MAIS
// de um professor com o mesmo primeiro nome (ex.: "Eliane" e "Eliane
// Rocha"), desambigua acrescentando a inicial do segundo nome (ex.:
// "Eliane" continua "Eliane", mas "Eliane Rocha" vira "Eliane R.").
function abreviarNomeProfessor(nomeCompleto: string, todosProfessores?: Array<{ nome: string }>): string {
  const partes = nomeCompleto.trim().split(/\s+/);
  const primeiroNome = partes[0] ?? nomeCompleto;
  if (!todosProfessores || partes.length < 2) return primeiroNome;

  const normaliza = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const temColisao = todosProfessores.some((p) => {
    if (p.nome === nomeCompleto) return false;
    const primeiroOutro = p.nome.trim().split(/\s+/)[0] ?? p.nome;
    return normaliza(primeiroOutro) === normaliza(primeiroNome);
  });

  if (!temColisao) return primeiroNome;
  const inicialSegundoNome = partes[1]?.[0] ?? "";
  return inicialSegundoNome ? `${primeiroNome} ${inicialSegundoNome}.` : primeiroNome;
}

export default function TurmaHorario() {
  const { id } = useParams();
  const turmaId = Number(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: turma, isLoading: isLoadingTurma } = useGetTurma(turmaId, { query: { enabled: !!turmaId, queryKey: ["turma", turmaId] as const } });
  const { data: horarioSlots, isLoading: isLoadingHorario } = useGetTurmaHorario(turmaId, { query: { enabled: !!turmaId, queryKey: getGetTurmaHorarioQueryKey(turmaId) } });
  const { data: todosProfessores } = useListProfessores();

  const [openOpcoes, setOpenOpcoes] = useState(false);
  const [gerandoCpsat, setGerandoCpsat] = useState(false);

  // [PRIORIDADE-CPSAT] Esse botão agora gera via CP-SAT (motor
  // preciso) em vez da heurística rápida -- por design de segurança,
  // o CP-SAT nunca grava direto na grade oficial, então isso sempre
  // cria uma prévia no Modo Experimental. Precisa promover lá pra
  // valer de verdade -- evita o incidente de sobrescrever a grade real
  // sem querer (já aconteceu antes nessa mesma tela).
  const handleGerarHorario = async () => {
    setGerandoCpsat(true);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const nomeExperimental = `CPSAT-${turma?.nome ?? turmaId}-${new Date().toISOString().slice(0, 16)}`;
      const data = await customFetch<{
        nomeExperimental: string;
        totalTurmas?: number;
        totalSlots?: number;
        slotsGerados?: number;
      }>(`${basePath}/api/horarios/gerar-cpsat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turmaId, nomeExperimental }),
        responseType: "json",
      });
      toast({
        title: `Prévia gerada via CP-SAT: "${data.nomeExperimental}"`,
        description: "Nada mudou na grade oficial ainda — revise em Horário → Modo Experimental e promova só se estiver bom.",
      });
      setOpenOpcoes(false);
    } catch (err) {
      toast({ title: "Não foi possível gerar via CP-SAT", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGerandoCpsat(false);
    }
  };

  // [FIX] Retorna TODOS os horarios do slot (nao so o primeiro) -- em
  // co-docencia, duas linhas compartilham o mesmo dia+aula com
  // professores diferentes.
  const getSlots = (diaSemana: number, numeroAula: number) => {
    return horarioSlots?.filter(s => s.diaSemana === diaSemana && s.numeroAula === numeroAula) ?? [];
  };

  const getMaxAulasTurma = () => {
    if (!horarioSlots || horarioSlots.length === 0) return 5; // Default grid 5 rows
    const max = Math.max(...horarioSlots.map(s => s.numeroAula));
    return Math.max(max, 5); // At least 5 rows
  };

  const numRows = getMaxAulasTurma();

  if (isLoadingTurma || isLoadingHorario) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Horário: {turma?.nome}</h1>
          <p className="text-muted-foreground">
            {turma?.serie} • {turma?.turno ? turnosMap[turma.turno] : ''} • Ano {turma?.anoLetivo}
          </p>
        </div>

        <Dialog open={openOpcoes} onOpenChange={setOpenOpcoes}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Sparkles className="h-4 w-4" />
              Gerar Horário Automático
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Gerar via CP-SAT
              </DialogTitle>
              <DialogDescription>
                O motor CP-SAT monta uma grade otimizada (minimiza janelas de professor) pra essa turma. O resultado
                vai pro <strong>Modo Experimental</strong> — a grade oficial só muda se você revisar e promover
                de lá. Nada é sobrescrito agora.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
                <Settings2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                A quantidade de aulas por dia é calculada automaticamente pelo esquema de horário configurado
                para o turno e nível de ensino desta turma.
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenOpcoes(false)}>Cancelar</Button>
              <Button onClick={handleGerarHorario} disabled={gerandoCpsat}>
                {gerandoCpsat ? "Gerando..." : "Gerar via CP-SAT"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <MatrizCurricularCard turmaId={turmaId} matrizCurricularIdAtual={turma?.matrizCurricularId ?? null} />
      <ProfessoresPorDisciplinaCard turmaId={turmaId} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-6 border-b border-border bg-muted/50">
              <div className="p-4 font-medium text-muted-foreground text-center border-r border-border">Aula</div>
              {diasSemana.map(dia => (
                <div key={dia} className="p-4 font-semibold text-center border-r border-border last:border-0">{dia}</div>
              ))}
            </div>

            {Array.from({ length: numRows }).map((_, rowIndex) => {
              const aulaNum = rowIndex + 1;
              return (
                <div key={aulaNum} className="grid grid-cols-6 border-b border-border last:border-0">
                  <div className="p-4 flex items-center justify-center font-medium text-muted-foreground border-r border-border bg-muted/20">
                    {aulaNum}ª Aula
                  </div>

                  {Array.from({ length: 5 }).map((_, colIndex) => {
                    const slotsAqui = getSlots(colIndex, aulaNum);
                    const slot = slotsAqui[0];
                    const nomesProfessores = slotsAqui.map(s => abreviarNomeProfessor(s.professor?.nome || "Sem professor", todosProfessores)).join(" + ");

                    if (!slot) {
                      return (
                        <div key={`${aulaNum}-${colIndex}`} className="p-2 border-r border-border last:border-0 bg-background hover:bg-muted/30 transition-colors min-h-[100px] flex items-center justify-center">
                          <span className="text-xs text-muted-foreground/30">Vago</span>
                        </div>
                      );
                    }

                    return (
                      <div key={slot.id} className="p-2 border-r border-border last:border-0 relative group">
                        <div
                          className="h-full rounded-md p-3 flex flex-col justify-between shadow-sm transition-transform hover:-translate-y-0.5 border"
                          style={{
                            backgroundColor: `${slot.disciplina?.cor}15`, // 15% opacity
                            borderColor: `${slot.disciplina?.cor}30`, // 30% opacity
                            borderLeftWidth: '4px',
                            borderLeftColor: slot.disciplina?.cor || 'var(--primary)'
                          }}
                        >
                          <div>
                            <div className="font-bold text-sm line-clamp-2 leading-tight" style={{ color: slot.disciplina?.cor ? `${slot.disciplina.cor}dd` : 'inherit' }}>
                              {slot.disciplina?.nome}
                            </div>
                          </div>

                          <div className="mt-2 text-xs font-medium text-foreground/80 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-foreground/30"></span>
                            <span className="truncate">{nomesProfessores}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

// RF-TUR-02: aplica de uma vez as disciplinas + cargas horárias de uma
// Matriz Curricular (por série) a esta turma, substituindo o que estava
// vinculado manualmente. É a ponte entre o cadastro de Curso/Matriz
// (pages/cursos) e a turma de fato.
function MatrizCurricularCard({
  turmaId,
  matrizCurricularIdAtual,
}: {
  turmaId: number;
  matrizCurricularIdAtual: number | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cursoId, setCursoId] = useState<string>("");
  const [matrizId, setMatrizId] = useState<string>("");

  const { data: cursos, isLoading: carregandoCursos } = useListCursos();
  const { data: matrizes, isLoading: carregandoMatrizes } = useListMatrizesCurriculares(
    Number(cursoId),
    { query: { enabled: !!cursoId, queryKey: getListMatrizesCurricularesQueryKey(Number(cursoId)) } },
  );
  const aplicarMatriz = useAplicarMatrizTurma();

  const matrizAplicada = matrizCurricularIdAtual != null;

  function aplicar() {
    if (!matrizId) return;
    aplicarMatriz.mutate(
      { id: turmaId, data: { matrizCurricularId: Number(matrizId) } },
      {
        onSuccess: () => {
          toast({ title: "Matriz curricular aplicada!", description: "As disciplinas e cargas horárias da turma foram atualizadas." });
          queryClient.invalidateQueries({ queryKey: getGetTurmaQueryKey(turmaId) });
          queryClient.invalidateQueries({ queryKey: ["turma", turmaId] as const });
        },
        onError: () => {
          toast({ title: "Erro ao aplicar matriz curricular", variant: "destructive" });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Matriz Curricular
        </CardTitle>
        <CardDescription>
          {matrizAplicada
            ? "Esta turma já segue uma matriz curricular. Aplicar outra substitui as disciplinas e cargas horárias atuais."
            : "Aplique a matriz curricular da série desta turma para preencher automaticamente as disciplinas e cargas horárias, em vez de vincular uma por uma."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Curso</label>
            <Select value={cursoId} onValueChange={(v) => { setCursoId(v); setMatrizId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder={carregandoCursos ? "Carregando..." : "Selecione o curso"} />
              </SelectTrigger>
              <SelectContent>
                {cursos?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Série / Matriz</label>
            <Select value={matrizId} onValueChange={setMatrizId} disabled={!cursoId}>
              <SelectTrigger>
                <SelectValue placeholder={carregandoMatrizes ? "Carregando..." : "Selecione a série"} />
              </SelectTrigger>
              <SelectContent>
                {matrizes?.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.serieAno} ({m.cargaHorariaSemanalTotal}h/semana)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={aplicar} disabled={!matrizId || aplicarMatriz.isPending}>
            {aplicarMatriz.isPending ? "Aplicando..." : "Aplicar à turma"}
          </Button>
        </div>

        {matrizAplicada && (
          <Badge variant="secondary" className="mt-3">
            Matriz curricular #{matrizCurricularIdAtual} aplicada
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

// [DUPLA-DOCENCIA] Lista cada disciplina da turma com seu(s)
// professor(es) -- normalmente 1, mas pode ter 2 quando é dupla
// docência (dois professores dando aula junto, mesmo horário; ver
// RESTRIÇÃO 0 do solver CP-SAT). Permite trocar o professor de cada
// linha, adicionar um segundo professor (criar a dupla) ou remover um
// dos dois (desfazer a dupla).
//
// Usa customFetch direto (em vez de hooks gerados pelo Orval) porque
// as rotas /disciplinas/linha/:id e /disciplinas/:id/dupla são novas
// -- o cliente gerado ainda não as conhece até o Orval rodar de novo.
function ProfessoresPorDisciplinaCard({ turmaId }: { turmaId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const { data: turma, isLoading } = useGetTurma(turmaId, { query: { enabled: !!turmaId, queryKey: ["turma", turmaId] as const } });
  const { data: professores } = useListProfessores();
  const [salvandoLinhaId, setSalvandoLinhaId] = useState<number | null>(null);
  const [adicionandoDuplaDisciplinaId, setAdicionandoDuplaDisciplinaId] = useState<number | null>(null);
  const [professorNovaDupla, setProfessorNovaDupla] = useState<string>("");

  // tipagem solta pra esses campos novos até o cliente gerado (Orval)
  // ser atualizado com o novo formato de disciplinasComCarga
  const disciplinas = ((turma as any)?.disciplinasComCarga ?? []) as Array<{
    turmaDisciplinaId: number;
    disciplinaId: number;
    nome: string;
    cargaHorariaSemanal: number;
    professorId: number | null;
    professorNome: string | null;
  }>;

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["turma", turmaId] as const });
    queryClient.invalidateQueries({ queryKey: getGetTurmaQueryKey(turmaId) });
  }

  async function trocarProfessor(linhaId: number, professorId: number | null) {
    setSalvandoLinhaId(linhaId);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      await customFetch(`${basePath}/api/turmas/${turmaId}/disciplinas/linha/${linhaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorId }),
        responseType: "json",
      });
      invalidar();
    } catch (err) {
      toast({ title: "Não foi possível trocar o professor", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSalvandoLinhaId(null);
    }
  }

  async function removerLinha(linhaId: number) {
    setSalvandoLinhaId(linhaId);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      await customFetch(`${basePath}/api/turmas/${turmaId}/disciplinas/linha/${linhaId}`, {
        method: "DELETE",
        responseType: "json",
      });
      toast({ title: "Professor removido dessa disciplina" });
      invalidar();
    } catch (err) {
      toast({ title: "Não foi possível remover", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSalvandoLinhaId(null);
    }
  }

  async function confirmarAdicionarDupla(disciplinaId: number) {
    if (!professorNovaDupla) return;
    setSalvandoLinhaId(-1);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      await customFetch(`${basePath}/api/turmas/${turmaId}/disciplinas/${disciplinaId}/dupla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorId: Number(professorNovaDupla) }),
        responseType: "json",
      });
      toast({ title: "Segundo professor adicionado", description: "Os dois serão escalados sempre no mesmo horário ao gerar a grade." });
      setAdicionandoDuplaDisciplinaId(null);
      setProfessorNovaDupla("");
      invalidar();
    } catch (err) {
      toast({ title: "Não foi possível adicionar o segundo professor", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSalvandoLinhaId(null);
    }
  }

  // agrupa as linhas por disciplina (1 ou 2 linhas por disciplina)
  const porDisciplina = new Map<number, typeof disciplinas>();
  for (const d of disciplinas) {
    const lista = porDisciplina.get(d.disciplinaId) ?? [];
    lista.push(d);
    porDisciplina.set(d.disciplinaId, lista);
  }

  return (
    <Card>
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Professores por Disciplina
                </CardTitle>
                <CardDescription>
                  Defina quem dá cada disciplina desta turma. Pra dupla docência (dois professores juntos, mesmo horário), adicione um segundo professor na mesma disciplina.
                </CardDescription>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {isLoading && <Skeleton className="h-24 w-full" />}
            {!isLoading && disciplinas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma disciplina vinculada ainda. Aplique uma matriz curricular acima primeiro.</p>
            )}
            {[...porDisciplina.entries()].map(([disciplinaId, linhas]) => (
              <div key={disciplinaId} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{linhas[0].nome}</span>
                  <span className="text-xs text-muted-foreground">{linhas[0].cargaHorariaSemanal}h/semana</span>
                </div>
                {linhas.map((linha) => (
                  <div key={linha.turmaDisciplinaId} className="flex items-center gap-2">
                    <Select
                      value={linha.professorId != null ? String(linha.professorId) : undefined}
                      onValueChange={(v) => trocarProfessor(linha.turmaDisciplinaId, Number(v))}
                      disabled={salvandoLinhaId === linha.turmaDisciplinaId}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione o professor" />
                      </SelectTrigger>
                      <SelectContent>
                        {professores?.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {linhas.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removerLinha(linha.turmaDisciplinaId)}
                        disabled={salvandoLinhaId === linha.turmaDisciplinaId}
                        title="Remover este professor da disciplina"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                {linhas.length === 1 && adicionandoDuplaDisciplinaId !== disciplinaId && (
                  <Button variant="outline" size="sm" onClick={() => setAdicionandoDuplaDisciplinaId(disciplinaId)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar professor (dupla docência)
                  </Button>
                )}
                {adicionandoDuplaDisciplinaId === disciplinaId && (
                  <div className="flex items-center gap-2">
                    <Select value={professorNovaDupla} onValueChange={setProfessorNovaDupla}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Segundo professor" />
                      </SelectTrigger>
                      <SelectContent>
                        {professores?.filter((p) => p.id !== linhas[0].professorId).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => confirmarAdicionarDupla(disciplinaId)} disabled={!professorNovaDupla || salvandoLinhaId === -1}>
                      Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAdicionandoDuplaDisciplinaId(null); setProfessorNovaDupla(""); }}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
