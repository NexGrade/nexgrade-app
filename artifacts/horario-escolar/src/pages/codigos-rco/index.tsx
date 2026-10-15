// [CODIGOS-RCO-TELA] (14/10/2026) Codigos que o arquivo do RCO exige: codigo da turma no
// SERE (e da parte IF, no 3o ano tecnico) e Codigo Externo da disciplina. Antes so dava
// para cadastrar por script; a exportacao bloqueava e a escola nao tinha onde corrigir.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Download, Loader2, Lightbulb } from "lucide-react";

type TurmaCod = {
  id: number; nome: string; turno: string; serie: string;
  codigoSere: number | null; codigoSereIf: number | null;
  aulas: number; pendente: boolean; repetidoCom: string[];
};
type DiscCod = {
  id: number; nome: string; codigoSae: string | null; codigoExternoRco: number | null;
  codigoPeloSae: number | null; codigoNoRco: number | null; origem: "externo" | "sae" | "dicionario" | null;
  aulas: number; pendente: boolean;
  sugestao: { codigoSae: string | null; codigoExternoRco: number | null } | null; // [CODIGOS-SUGESTAO]
};
type Resposta = {
  turmas: TurmaCod[]; disciplinas: DiscCod[];
  resumo: { turmasPendentes: number; disciplinasPendentes: number; turmasRepetidas: number; disciplinasComSugestao: number };
};

const CHAVE = ["codigos-rco"];
const TURNO_LABEL: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const ORIGEM_LABEL: Record<string, string> = {
  externo: "Código Externo cadastrado",
  sae: "pela tabela do SAE",
  dicionario: "padrão do sistema",
};

function mensagemErro(err: unknown): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object" && "error" in (err.data as any)) {
    return String((err.data as any).error);
  }
  return "Não foi possível salvar. Tente novamente.";
}

/** Campo numerico que salva ao sair (ou Enter) e so quando o valor mudou. */
function CampoCodigo({ valor, onSalvar, placeholder, rotulo, opcional }: {
  valor: number | null; onSalvar: (v: string) => Promise<void>; placeholder?: string; rotulo: string; opcional?: boolean;
}) {
  const inicial = valor == null ? "" : String(valor);
  const [texto, setTexto] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [base, setBase] = useState(inicial);
  if (base !== inicial) { setBase(inicial); setTexto(inicial); } // valor mudou no servidor

  async function salvar() {
    const limpo = texto.trim();
    if (limpo === inicial) return;
    if (limpo !== "" && !/^\d+$/.test(limpo)) { setTexto(inicial); return; }
    setSalvando(true);
    try { await onSalvar(limpo); } catch { setTexto(inicial); } finally { setSalvando(false); }
  }
  return (
    <div className="relative w-32">
      <Input
        aria-label={rotulo}
        inputMode="numeric"
        value={texto}
        placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
        onBlur={salvar}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTexto(inicial); }}
        className={valor == null && !opcional ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20" : ""}
        disabled={salvando}
      />
      {salvando && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

export default function CodigosRcoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [soPendentes, setSoPendentes] = useState(false);
  const [turno, setTurno] = useState<string>("todos");

  const { data, isLoading, isError } = useQuery({
    queryKey: CHAVE,
    queryFn: () => customFetch<Resposta>("/api/codigos-rco", { responseType: "json" } as any),
  });

  async function salvar(caminho: string, corpo: Record<string, string>, oQue: string) {
    try {
      await customFetch(caminho, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      toast({ title: `${oQue} salvo` });
    } catch (err) {
      toast({ title: mensagemErro(err), variant: "destructive" });
      throw err;
    }
  }

  const [aplicandoTodas, setAplicandoTodas] = useState(false);

  /** Corpo do PATCH com o que a sugestao preenche (so os campos vazios). */
  function corpoSugestao(d: DiscCod): Record<string, string> {
    const c: Record<string, string> = {};
    if (d.sugestao?.codigoSae != null && d.codigoSae == null) c.codigoSae = String(d.sugestao.codigoSae);
    if (d.sugestao?.codigoExternoRco != null && d.codigoExternoRco == null) c.codigoExternoRco = String(d.sugestao.codigoExternoRco);
    return c;
  }

  async function aplicarTodas() {
    const lista = (data?.disciplinas ?? []).filter((d) => d.sugestao != null);
    setAplicandoTodas(true);
    let ok = 0;
    try {
      for (const d of lista) {
        try {
          await customFetch(`/api/codigos-rco/disciplinas/${d.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoSugestao(d)),
          });
          ok++;
        } catch { /* segue com as outras; o que falhou continua sugerido */ }
      }
      await queryClient.invalidateQueries({ queryKey: CHAVE });
      toast({ title: `${ok} de ${lista.length} sugestões aplicadas` });
    } finally {
      setAplicandoTodas(false);
    }
  }

  const turmas = useMemo(() => (data?.turmas ?? [])
    .filter((t) => turno === "todos" || t.turno === turno)
    .filter((t) => !soPendentes || t.pendente || t.repetidoCom.length > 0), [data, turno, soPendentes]);
  const disciplinas = useMemo(() => (data?.disciplinas ?? [])
    .filter((d) => !soPendentes || d.pendente), [data, soPendentes]);
  const turnos = useMemo(() => [...new Set((data?.turmas ?? []).map((t) => t.turno))], [data]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (isError || !data) {
    return <p className="text-destructive">Não foi possível carregar os códigos. Recarregue a página.</p>;
  }
  const { resumo } = data;
  const tudoOk = resumo.turmasPendentes === 0 && resumo.disciplinasPendentes === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Códigos do RCO</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            O arquivo da grade para o RCO precisa do código de cada turma no SERE e do Código Externo de cada disciplina.
            Digite o código e saia do campo para salvar. Deixe vazio para apagar.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/export"><Download className="mr-2 h-4 w-4" />Exportar para o RCO</Link>
        </Button>
      </div>

      <Card className={tudoOk ? "border-emerald-300" : "border-amber-300"}>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
          {tudoOk ? (
            <span className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />Todos os códigos necessários estão cadastrados.
            </span>
          ) : (
            <span className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Faltam {resumo.turmasPendentes} turma{resumo.turmasPendentes === 1 ? "" : "s"} e {resumo.disciplinasPendentes} disciplina{resumo.disciplinasPendentes === 1 ? "" : "s"} com aula na grade.
            </span>
          )}
          {resumo.turmasRepetidas > 0 && (
            <span className="text-amber-700 dark:text-amber-400">{resumo.turmasRepetidas} turma(s) com código repetido — confira.</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Switch id="so-pendentes" checked={soPendentes} onCheckedChange={setSoPendentes} />
            <Label htmlFor="so-pendentes" className="cursor-pointer">Só o que falta</Label>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={resumo.turmasPendentes === 0 && resumo.disciplinasPendentes > 0 ? "disciplinas" : "turmas"}>
        <TabsList>
          <TabsTrigger value="turmas">Turmas{resumo.turmasPendentes > 0 ? ` (${resumo.turmasPendentes})` : ""}</TabsTrigger>
          <TabsTrigger value="disciplinas">Disciplinas{resumo.disciplinasPendentes > 0 ? ` (${resumo.disciplinasPendentes})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="turmas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Código da turma no SERE</CardTitle>
              <CardDescription>
                É o código da turma no SERE (no Urânia, campo "Código Externo" da turma). O <strong>código da parte IF</strong> só
                se preenche no 3º ano técnico que o RCO divide em duas turmas (formação geral e itinerário formativo).
              </CardDescription>
              {turnos.length > 1 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {["todos", ...turnos].map((t) => (
                    <Button key={t} size="sm" variant={turno === t ? "default" : "outline"} onClick={() => setTurno(t)}>
                      {t === "todos" ? "Todos os turnos" : TURNO_LABEL[t] ?? t}
                    </Button>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {turmas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma turma para mostrar.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Turma</TableHead>
                        <TableHead>Turno</TableHead>
                        <TableHead className="text-right">Aulas</TableHead>
                        <TableHead>Código SERE</TableHead>
                        <TableHead>Código SERE (parte IF)</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turmas.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.nome}<div className="text-xs text-muted-foreground">{t.serie}</div></TableCell>
                          <TableCell>{TURNO_LABEL[t.turno] ?? t.turno}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.aulas}</TableCell>
                          <TableCell>
                            <CampoCodigo rotulo={`Código SERE da turma ${t.nome}`} valor={t.codigoSere}
                              onSalvar={(v) => salvar(`/api/codigos-rco/turmas/${t.id}`, { codigoSere: v }, `Código da ${t.nome}`)} />
                          </TableCell>
                          <TableCell>
                            <CampoCodigo rotulo={`Código SERE da parte IF da turma ${t.nome}`} valor={t.codigoSereIf} placeholder="só 3º técnico" opcional
                              onSalvar={(v) => salvar(`/api/codigos-rco/turmas/${t.id}`, { codigoSereIf: v }, `Código IF da ${t.nome}`)} />
                          </TableCell>
                          <TableCell>
                            {t.repetidoCom.length > 0 ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700">Repetido em {t.repetidoCom.join(", ")}</Badge>
                            ) : t.pendente ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700">Falta o código</Badge>
                            ) : t.codigoSere != null ? (
                              <Badge variant="outline" className="border-emerald-400 text-emerald-700">OK</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">sem aulas na grade</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disciplinas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Código Externo da disciplina</CardTitle>
              <CardDescription>
                É o "Código Externo" da disciplina no SERE/Urânia, <strong>não</strong> o código SAE. Quando a disciplina tem SAE
                conhecido, o sistema já usa o código pela tabela do SAE e não é preciso preencher. Se preencher, o Código Externo
                cadastrado aqui vale sobre o do SAE.
              </CardDescription>
              {resumo.disciplinasComSugestao > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/20">
                  <Lightbulb className="h-4 w-4 text-sky-600" />
                  <span>
                    {resumo.disciplinasComSugestao} disciplina{resumo.disciplinasComSugestao === 1 ? "" : "s"} com código sugerido: outras escolas
                    já cadastraram a disciplina de mesmo nome. Confira antes de usar.
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={aplicarTodas} disabled={aplicandoTodas}>
                    {aplicandoTodas && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Usar todas as sugestões
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {disciplinas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma disciplina para mostrar.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Disciplina</TableHead>
                        <TableHead className="text-right">Aulas/semana</TableHead>
                        <TableHead>SAE</TableHead>
                        <TableHead>Código Externo</TableHead>
                        <TableHead>Vai para o RCO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disciplinas.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.aulas}</TableCell>
                          <TableCell>
                            <CampoCodigo rotulo={`Código SAE de ${d.nome}`} valor={d.codigoSae == null || !/^\d+$/.test(d.codigoSae) ? null : Number(d.codigoSae)}
                              placeholder={d.codigoSae != null && !/^\d+$/.test(d.codigoSae) ? d.codigoSae : undefined}
                              opcional
                              onSalvar={(v) => salvar(`/api/codigos-rco/disciplinas/${d.id}`, { codigoSae: v }, `SAE de ${d.nome}`)} />
                          </TableCell>
                          <TableCell>
                            <CampoCodigo rotulo={`Código Externo de ${d.nome}`} valor={d.codigoExternoRco}
                              placeholder={d.codigoPeloSae != null ? `SAE → ${d.codigoPeloSae}` : undefined}
                              onSalvar={(v) => salvar(`/api/codigos-rco/disciplinas/${d.id}`, { codigoExternoRco: v }, `Código de ${d.nome}`)} />
                            {d.sugestao && (
                              <button
                                type="button"
                                className="mt-1 flex items-center gap-1 text-xs text-sky-700 hover:underline dark:text-sky-400"
                                onClick={() => salvar(`/api/codigos-rco/disciplinas/${d.id}`, corpoSugestao(d), `Sugestão de ${d.nome}`).catch(() => {})}
                              >
                                <Lightbulb className="h-3 w-3" />
                                Usar sugestão:
                                {d.sugestao.codigoSae != null && ` SAE ${d.sugestao.codigoSae}`}
                                {d.sugestao.codigoSae != null && d.sugestao.codigoExternoRco != null && " ·"}
                                {d.sugestao.codigoExternoRco != null && ` Externo ${d.sugestao.codigoExternoRco}`}
                              </button>
                            )}
                          </TableCell>
                          <TableCell>
                            {d.codigoNoRco != null ? (
                              <span className="text-sm">
                                <span className="font-medium tabular-nums">{d.codigoNoRco}</span>
                                <span className="text-xs text-muted-foreground"> · {ORIGEM_LABEL[d.origem ?? ""] ?? ""}</span>
                              </span>
                            ) : d.pendente ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700">Falta o código</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">sem aulas na grade</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
