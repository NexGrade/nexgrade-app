// [MODO-RASCUNHO] (06/11/2026) Estado do rascunho da escola na tela. Um rascunho por escola (servidor) e, em cada
// navegador, se a pessoa esta com ele ligado (localStorage). Ligado, as telas Grade, Disponibilidade e Turmas leem e
// gravam no rascunho; nada vale para a escola ate "Aplicar na escola".
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type Rascunho = {
  nome: string; criadoEm: string; criadoPor: string | null;
  /** [RASCUNHO-ALCANCE] "todos", um turno ou "turmas" (turmaIds); rascunhos antigos nao tem (= escola toda) */
  alcance?: string; turmaIds?: number[];
  aulas: number; mudancasDisponibilidade: number; mudancasAtribuicao: number;
};

const CHAVE = "nexgrade.rascunhoLigado";
const EVENTO = "nexgrade:rascunho";
const lerLigado = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };

export function ligarRascunho(nome: string | null) {
  try { if (nome) localStorage.setItem(CHAVE, nome); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENTO));
}

export function useRascunho() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["rascunho"],
    queryFn: () => customFetch<{ rascunho: Rascunho | null }>("/api/horarios/rascunho/atual"),
    staleTime: 30_000,
  });
  const [ligadoNome, setLigadoNome] = useState<string | null>(lerLigado);
  useEffect(() => {
    const f = () => setLigadoNome(lerLigado());
    window.addEventListener(EVENTO, f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener(EVENTO, f); window.removeEventListener("storage", f); };
  }, []);
  const rascunho = q.data?.rascunho ?? null;
  const ligado = !!rascunho && ligadoNome === rascunho.nome;
  return {
    rascunho,
    carregando: q.isLoading,
    ligado,
    /** nome do rascunho quando ligado (para passar as telas); null = oficial */
    nomeAtivo: ligado ? rascunho!.nome : null,
    recarregar: () => qc.invalidateQueries({ queryKey: ["rascunho"] }),
  };
}
