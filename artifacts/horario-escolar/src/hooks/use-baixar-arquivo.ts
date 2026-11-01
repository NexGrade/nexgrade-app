// [MENU-UNICO] (28/10/2026) Download autenticado usado por Imprimir Grade (planilha), Relatórios
// Pedagógicos e Exportar para o RCO. Um <a href="/api/..."> não leva o token do Clerk, então
// o arquivo vem por customFetch como blob e só depois vira link. Cada botão tem a sua chave
// ("Gerando..." só no botão clicado).
import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function montarUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  return url.toString();
}

export function salvarBlob(blob: Blob, nome: string) {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}

export function useBaixarArquivo() {
  const { toast } = useToast();
  const [baixando, setBaixando] = useState<Record<string, boolean>>({});
  const baixar = async (url: string, nome: string, chave: string) => {
    setBaixando((s) => ({ ...s, [chave]: true }));
    try {
      const blob = await customFetch<Blob>(url, { responseType: "blob" });
      salvarBlob(blob, nome);
      toast({ title: `Download iniciado: ${nome}` });
    } catch (err) {
      toast({ title: "Erro ao baixar arquivo", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBaixando((s) => ({ ...s, [chave]: false }));
    }
  };
  return { baixar, baixando };
}

export const SEMANA_ATUAL = "atual";
export const SEMANA_PROXIMA = "proxima";
