// [ARQUIVO-RCO] tipos e consulta da situacao do arquivo do RCO (tela Arquivo do RCO e selo do menu)
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type ResumoArquivoRco = {
  disciplinas: number; turmas: number; linhasGrade: number;
  turmasPorTurno: Record<string, number>; turmasComParteIf: number; cursos: number;
};
export type SituacaoArquivoRco = {
  solicitado: { em: string; mensagem: string | null } | null;
  enviado: { nomeArquivo: string; enviadoEm: string; enviadoPor: string | null; resumo: ResumoArquivoRco; tamanho: number } | null;
  /** [IMPORTAR-TURMAS-RCO] turmas cadastradas a partir do arquivo pela equipe NexGrade */
  importado?: { em: string; turmas: number; disciplinasNovas: number } | null;
};
export const CHAVE_ARQUIVO_RCO = ["/api/arquivo-rco"] as const;

export const ROTULO_TURNO: Record<string, string> = { manha: "manhã", tarde: "tarde", noite: "noite", integral: "integral" };
export const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function useSituacaoArquivoRco(habilitado = true) {
  return useQuery({
    queryKey: CHAVE_ARQUIVO_RCO,
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => customFetch<SituacaoArquivoRco>("/api/arquivo-rco", { responseType: "json" } as any),
  });
}

