// [ARQUIVO-RCO] (26/10/2026) A escola envia à Nexus Core o arquivo de exportação da Grade de
// Horário do RCO (cadastro oficial: disciplinas com Código Externo, turmas com código SERE e a
// matriz de cada turma). A Nexus Core pede pelo Painel Master; aqui aparece o aviso e o envio.
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import { CHAVE_ARQUIVO_RCO, ROTULO_TURNO, dataHora, useSituacaoArquivoRco } from "@/lib/arquivo-rco";

export default function ArquivoRcoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const { data, isLoading } = useSituacaoArquivoRco();

  async function enviar(arquivo: File) {
    setEnviando(true);
    try {
      const xml = await arquivo.text();
      await customFetch(`/api/arquivo-rco?nome=${encodeURIComponent(arquivo.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
        responseType: "json",
      } as any);
      await queryClient.invalidateQueries({ queryKey: CHAVE_ARQUIVO_RCO });
      toast({ title: "Arquivo enviado", description: "Obrigado! A equipe NexGrade já pode usar os dados." });
    } catch (err) {
      const msg = err instanceof ApiError && (err.data as { error?: string } | undefined)?.error;
      toast({ title: "Não foi possível enviar", description: msg || (err instanceof Error ? err.message : undefined), variant: "destructive" });
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function baixar() {
    try {
      const blob = await customFetch<Blob>("/api/arquivo-rco/baixar", { responseType: "blob" } as any);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data?.enviado?.nomeArquivo ?? "exportacao-rco.xml";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Não foi possível baixar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Arquivo do RCO</h1>
        <p className="text-muted-foreground">
          Envie à equipe NexGrade o arquivo que o RCO gera na tela Grade de Horário. Ele traz o cadastro oficial da escola
          (disciplinas, turmas e a matriz de cada turma) e evita digitar códigos à mão.
        </p>
      </div>

      {isLoading ? <Skeleton className="h-24 w-full" /> : data?.solicitado && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">A equipe NexGrade pediu este arquivo em {dataHora(data.solicitado.em)}.</p>
            {data.solicitado.mensagem && <p>{data.solicitado.mensagem}</p>}
            <p>Siga os passos abaixo e envie o arquivo. Leva menos de um minuto.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Baixe o arquivo no RCO</CardTitle>
          <CardDescription>Quem faz: a secretaria ou a direção, com o login do RCO.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>No RCO, abra <strong>Grade de Horário</strong> e escolha o <strong>Período Letivo</strong> atual.</li>
            <li>Use a opção de <strong>exportar</strong> da tela. O RCO baixa um arquivo <strong>.XML</strong>. Se não encontrar a opção, fale com a equipe NexGrade.</li>
            <li>Não abra nem altere o arquivo antes de enviar.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Envie o arquivo aqui</CardTitle>
          <CardDescription>Um envio novo substitui o anterior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={entrada}
            type="file"
            accept=".xml,.XML,application/xml,text/xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }}
          />
          <Button onClick={() => entrada.current?.click()} disabled={enviando} className="gap-2">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {enviando ? "Enviando..." : "Escolher o arquivo .XML e enviar"}
          </Button>

          {data?.enviado && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Último envio: {dataHora(data.enviado.enviadoEm)}
                {data.enviado.enviadoPor ? ` · ${data.enviado.enviadoPor}` : ""}
              </p>
              <p>
                {data.enviado.nomeArquivo}: {data.enviado.resumo.turmas} turmas
                ({Object.entries(data.enviado.resumo.turmasPorTurno).map(([t, n]) => `${n} ${ROTULO_TURNO[t] ?? t}`).join(", ")}),{" "}
                {data.enviado.resumo.disciplinas} disciplinas e {data.enviado.resumo.linhasGrade} linhas de grade.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={baixar}>
                <Download className="h-3.5 w-3.5" /> Baixar o arquivo enviado
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
