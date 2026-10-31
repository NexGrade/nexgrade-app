// [MENU-UNICO] (28/10/2026) Exportar para o RCO em tela propria (antes era um cartao de Exportar Dados).
// XML por turno, aviso das turmas com trio/dupla e script de gravacao (F12 ou atalho do RCO).
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query"; // [RCO-TURMAS-SCRIPT]
import { customFetch, ApiError } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox"; // [RCO-ASSINCRONAS]
import { Download, BarChart3, Hash, FileUp, Bookmark, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter"; // [CODIGOS-RCO-TELA]
import { montarUrl as buildUrl, salvarBlob } from "@/hooks/use-baixar-arquivo";

export default function ExportarRcoPage() {
  const { toast } = useToast();
  const [seedEstado, setSeedEstado] = useState("PR");
  const [seedTurno, setSeedTurno] = useState("matutino");
  const [seedAssinc, setSeedAssinc] = useState(false); // [RCO-SEM-ASSINC] (26/10/2026) RCO = PDF por turma: assincronas fora por padrao
  const [loadingScript, setLoadingScript] = useState(false); // [RCO-SCRIPT]
  const [loadingSeed, setLoadingSeed] = useState(false);
  // [NOVO] Erro estruturado do backend (disciplinas sem codigo SAE ou
  // turmas sem nivel de ensino definido) -- mostrado na tela em vez de
  // so um toast generico, pra a pessoa saber exatamente o que corrigir
  // antes de tentar exportar de novo.
  const [seedErro, setSeedErro] = useState<{
    mensagem: string;
    disciplinas?: { nome: string; aulas: number; turmas?: string[] }[]; // [RCO-SEM-CODIGO-TURMAS]
    turmas?: string[];
    corrigirEm?: string; // [CODIGOS-RCO-TELA]
  } | null>(null);
  const handleDownload = (blob: Blob, filename: string) => {
    salvarBlob(blob, filename);
    toast({ title: `Download iniciado: ${filename}` });
  };

  // [RCO-SCRIPT] script para colar no Console (F12) da tela Grade de Horario do RCO: grava trio/dupla
  // [RCO-TURMAS-SCRIPT] turmas do turno que precisam do script (trio/dupla, mesmo codigo); o resto vai pelo XML.
  // Quem nao e da direcao/coordenacao/secretaria recebe 403: o aviso simplesmente nao aparece.
  // [RCO-ATALHO] (31/10/2026) decisao da dona: o script de gravacao e liberado para todas as escolas
  // (antes, [RCO-SCRIPT-SUPORTE] de 28/10, so o suporte NexGrade). Sem F12: atalho do RCO abaixo.
  const { data: turmasScript } = useQuery({
    queryKey: ["/api/export/rco-script/turmas", seedTurno],
    enabled: seedEstado === "PR",
    retry: false,
    staleTime: 60 * 1000,
    queryFn: () => customFetch<{ totalTurmasRco: number; turmas: Array<{ codTurma: string; turma: string; motivos: string[] }> }>(
      buildUrl("/api/export/rco-script/turmas", { turno: seedTurno }), { responseType: "json" } as any),
  });

  const handleScriptRco = async (apenasMultiplas = false) => {
    setLoadingScript(true);
    setSeedErro(null);
    try {
      const url = buildUrl("/api/export/rco-script", { turno: seedTurno, apenas: apenasMultiplas ? "multiplas" : undefined });
      const blob = await customFetch<Blob>(url, { responseType: "blob" });
      handleDownload(blob, `rco-gravar-${seedTurno}${apenasMultiplas ? "-trios" : ""}-${new Date().toISOString().slice(0, 10)}.js`);
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === "object") {
        const data = err.data as { error?: string; disciplinasSemCodigo?: { nome: string; aulas: number; turmas?: string[] }[]; turmasSemNivel?: string[]; corrigirEm?: string };
        setSeedErro({ mensagem: data.error ?? "Não foi possível gerar o script.", disciplinas: data.disciplinasSemCodigo, turmas: data.turmasSemNivel, corrigirEm: data.corrigirEm });
      } else {
        toast({ title: "Erro ao gerar o script do RCO", variant: "destructive" });
      }
    } finally {
      setLoadingScript(false);
    }
  };

  const handleSeedDownload = async () => {
    setLoadingSeed(true);
    setSeedErro(null);
    try {
      const url = buildUrl("/api/export/relatorio-seed", { estado: seedEstado, turno: seedTurno, assincronas: seedEstado === "PR" ? (seedAssinc ? "1" : "0") : undefined });
      const blob = await customFetch<Blob>(url, { responseType: "blob" });
      const extensao = seedEstado === "PR" ? "xml" : "json";
      handleDownload(blob, `relatorio_seed_${seedEstado}_${seedTurno}_${new Date().getFullYear()}${seedEstado === "PR" ? (seedAssinc ? "" : "_sem-assincronas") : ""}.${extensao}`);
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === "object") {
        const data = err.data as { error?: string; disciplinasSemCodigo?: { nome: string; aulas: number; turmas?: string[] }[]; turmasSemNivel?: string[]; corrigirEm?: string };
        setSeedErro({
          mensagem: data.error ?? "Não foi possível gerar o relatório.",
          disciplinas: data.disciplinasSemCodigo,
          turmas: data.turmasSemNivel,
          corrigirEm: data.corrigirEm, // [CODIGOS-RCO-TELA]
        });
      } else {
        toast({ title: "Erro ao gerar relatório", variant: "destructive" });
      }
    } finally {
      setLoadingSeed(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6" /> Exportar para o RCO</h1>
        <p className="text-muted-foreground text-sm">Arquivo XML da grade para importar no RCO, por turno. Antes, confira os códigos em Códigos do RCO.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button asChild size="sm" variant="outline"><Link href="/codigos-rco"><Hash className="w-4 h-4 mr-1.5" />Códigos do RCO</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/arquivo-rco"><FileUp className="w-4 h-4 mr-1.5" />Arquivo do RCO</Link></Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Relatório SEED */}
        <Card className="lg:col-span-2 border-2 border-[#1565C0] bg-[#1565C0]/5 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4" /> Exportar para o RCO (XML)
            </CardTitle>
            <CardDescription>Gera o arquivo XML da grade no formato que o RCO importa (SEED-PR). Antes de exportar, confira se o Código INEP da escola (em Dados da Escola) e os códigos SERE das turmas estão cadastrados. O envio ao RCO é feito pela escola, manualmente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="space-y-1.5 w-40">
                <Label>Estado</Label>
                <Select value={seedEstado} onValueChange={(v) => { setSeedEstado(v); setSeedAssinc(false); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["SP","MG","RJ","BA","PR","RS","PE","CE","GO","AM"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {seedEstado === "PR" && (
                <div className="space-y-1.5 w-40">
                  <Label>Turno</Label>
                  <Select value={seedTurno} onValueChange={setSeedTurno}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="matutino">Matutino</SelectItem>
                      <SelectItem value="vespertino">Vespertino</SelectItem>
                      <SelectItem value="noturno">Noturno</SelectItem>
                      <SelectItem value="integral">Integral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={handleSeedDownload} disabled={loadingSeed}>
                <Download className="w-4 h-4 mr-2" />
                {loadingSeed ? "Gerando..." : `Baixar XML para o RCO (${seedEstado})`}
              </Button>
              {seedEstado === "PR" && (
                <Button variant="outline" onClick={() => handleScriptRco(false)} disabled={loadingScript}>
                  <Download className="w-4 h-4 mr-2" />
                  {loadingScript ? "Gerando..." : "Script para o Console (F12)"}
                </Button>
              )}
            </div>
            {seedEstado === "PR" && turmasScript && (
              <div className={`mt-4 rounded-md border p-3 text-sm ${turmasScript.turmas.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                {turmasScript.turmas.length === 0 ? (
                  <p>Neste turno nenhuma turma tem trio, híbrida, assíncrona junto com outra aula ou disciplinas com o mesmo código: <strong>só o XML</strong> já grava tudo certo no RCO.</p>
                ) : (
                  <div className="space-y-2">
                    <p>
                      <strong>{turmasScript.turmas.length} de {turmasScript.totalTurmasRco} turma(s) do RCO</strong> têm mais de uma disciplina no mesmo horário — trio, híbrida ou assíncrona junto com a aula presencial (o XML grava só uma).
                      {" "}O jeito mais fácil é o <strong>atalho do RCO</strong> (abaixo): ele grava todas as turmas do turno, sem XML.
                      Ou, nesta ordem: <strong>1)</strong> XML com todas as turmas (Incluir via Arquivo no RCO); <strong>2)</strong> script só destas turmas.
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {turmasScript.turmas.map((t) => <li key={t.codTurma}><strong>{t.turma}</strong>: {t.motivos.join("; ")}</li>)}
                    </ul>
                    <Button size="sm" variant="outline" onClick={() => handleScriptRco(true)} disabled={loadingScript} className="gap-1.5">
                      <Download className="w-3.5 h-3.5" /> {loadingScript ? "Gerando..." : `Script (F12) só destas ${turmasScript.turmas.length} turma(s)`}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {seedEstado === "PR" && (
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>Script para o Console (F12):</strong> no RCO, abra Grade de Horário, escolha o Período Letivo e o Turno, aperte F12, aba Console, cole o conteúdo do script e aperte Enter.
                Ele mostra a prévia de cada turma e só grava depois que você confirmar. Leva as assíncronas na mesma célula da aula presencial, como o RCO registra.
                O XML regrava a turma inteira: se usar os dois, o script vem <strong>depois</strong>.
              </p>
            )}
            {seedEstado === "PR" && (
              <div className="mt-4 flex items-start gap-2.5">
                <Checkbox id="seed-assinc" checked={seedAssinc} onCheckedChange={(c) => setSeedAssinc(c === true)} className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="seed-assinc" className="cursor-pointer">Incluir aulas assíncronas</Label>
                  <p className="text-xs text-muted-foreground">
                    Desmarcado por padrão. A assíncrona divide o horário com uma aula presencial da turma, e o RCO guarda só uma disciplina por horário no arquivo (a presencial se perdia). As assíncronas vão para o RCO pelo script de gravação, junto com a presencial.
                  </p>
                </div>
              </div>
            )}
            {seedErro && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <p className="font-medium text-destructive">{seedErro.mensagem}</p>
                {seedErro.disciplinas && seedErro.disciplinas.length > 0 && (
                  <ul className="mt-2 space-y-0.5 list-disc list-inside text-muted-foreground">
                    {seedErro.disciplinas.map((d) => (
                      <li key={d.nome}>
                        <span className="font-medium text-foreground">{d.nome}</span> <span className="text-xs">({d.aulas} aula{d.aulas === 1 ? "" : "s"}/semana)</span>
                        {d.turmas && d.turmas.length > 0 && (
                          <span className="text-xs"> — {d.turmas.length === 1 ? "turma" : "turmas"} {d.turmas.join(", ")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {seedErro.turmas && seedErro.turmas.length > 0 && (
                  <ul className="mt-2 space-y-0.5 list-disc list-inside text-muted-foreground">
                    {seedErro.turmas.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                )}
                {seedErro.corrigirEm && (
                  <Button asChild size="sm" className="mt-3">
                    <Link href={seedErro.corrigirEm}>Cadastrar os códigos do RCO</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        {seedEstado === "PR" && <AtalhoRco />}
      </div>
    </div>
  );
}

// [RCO-ATALHO] favorito "Gravar no RCO": arrasta uma vez para a barra de favoritos; no RCO, um clique grava
// (mesmo script do F12, com previa e confirmacao). Quem nao e da direcao/coordenacao/secretaria recebe 403
// e o bloco nao aparece.
type RespostaAtalho = { favorito: string; criadaEm: string; ultimoUsoEm: string | null };
function AtalhoRco() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const origem = window.location.origin;
  const chave = ["/api/export/rco-script/atalho", origem];
  const { data, isError } = useQuery({
    queryKey: chave,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => customFetch<RespostaAtalho>(buildUrl("/api/export/rco-script/atalho", { origem }), { responseType: "json" } as any),
  });
  const [trocando, setTrocando] = useState(false);
  // React 19 bloqueia href "javascript:" no JSX: o endereco do favorito entra pelo DOM
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (link.current && data?.favorito) link.current.setAttribute("href", data.favorito); }, [data?.favorito]);

  const trocar = async () => {
    if (!confirm("Gerar um atalho novo? O atalho antigo para de funcionar em todos os computadores e cada um precisa arrastar o novo.")) return;
    setTrocando(true);
    try {
      const novo = await customFetch<RespostaAtalho>("/api/export/rco-script/atalho/trocar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origem }), responseType: "json",
      } as any);
      queryClient.setQueryData(chave, novo);
      toast({ title: "Atalho novo gerado", description: "Apague o favorito antigo e arraste este para a barra de favoritos." });
    } catch {
      toast({ title: "Não foi possível gerar o atalho novo", variant: "destructive" });
    } finally {
      setTrocando(false);
    }
  };

  if (isError) return null;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Bookmark className="w-4 h-4" /> Atalho de gravação no RCO (sem F12)</CardTitle>
        <CardDescription>
          Grava a grade de todas as turmas do turno direto no RCO, inclusive trio, híbrida e assíncronas, sem abrir o Console.
          Ele mostra a prévia de cada turma e só grava depois que você confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal list-inside space-y-1.5">
          <li>Deixe a <strong>barra de favoritos</strong> aparecendo no navegador (Chrome ou Edge: <kbd className="rounded border px-1 text-xs">Ctrl</kbd> + <kbd className="rounded border px-1 text-xs">Shift</kbd> + <kbd className="rounded border px-1 text-xs">B</kbd>).</li>
          <li>
            <strong>Arraste</strong> o botão abaixo até a barra de favoritos (só uma vez em cada computador):
            <div className="mt-2">
              {data ? (
                <a
                  ref={link}
                  href="#"
                  draggable
                  onClick={(e) => { e.preventDefault(); toast({ title: "Arraste o botão para a barra de favoritos", description: "Clicar aqui não faz nada: o atalho funciona dentro da tela do RCO." }); }}
                  className="inline-flex items-center gap-2 rounded-md bg-[#1565C0] px-4 py-2 font-medium text-white shadow hover:bg-[#0D47A1] cursor-grab"
                >
                  <Bookmark className="w-4 h-4" /> Gravar no RCO
                </a>
              ) : (
                <span className="text-muted-foreground">Carregando o atalho...</span>
              )}
            </div>
          </li>
          <li>No RCO, abra <strong>Grade de Horário</strong>, escolha o <strong>Período Letivo</strong> e o <strong>Turno</strong> e clique no favorito <strong>Gravar no RCO</strong>.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          O atalho é desta escola: quem tiver o favorito grava esta grade no RCO em que estiver logado. Se um computador não deve mais ter o atalho, gere um novo.
          {data?.ultimoUsoEm && <> Último uso: {new Date(data.ultimoUsoEm).toLocaleString("pt-BR")}.</>}
        </p>
        <Button size="sm" variant="outline" onClick={trocar} disabled={trocando || !data} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> {trocando ? "Gerando..." : "Gerar atalho novo (o antigo para de funcionar)"}
        </Button>
      </CardContent>
    </Card>
  );
}
