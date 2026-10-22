// [CONFLITO-ACEITO] (21/10/2026) botão "Aceitar como está" usado nas faixas de conflito da Grade e da
// Disponibilidade (quem chega pelo "Ver conflito" pode aceitar ali mesmo, sem voltar à lista).
import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export const TIPOS_ACEITAVEIS = new Set([
  "pausa_entre_turnos", "intervalo_entre_turnos", "janelas_excessivas", "aulas_geminadas_excedidas",
  "hora_atividade_insuficiente", "hora_atividade_turno_incorreto", "sala_incompativel", "turma_sem_calendario",
]);

export function AceitarConflito({ tipo, descricao, depois }: { tipo: string | null; descricao: string; depois?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [feito, setFeito] = useState(false);
  const [gravando, setGravando] = useState(false);
  if (!tipo || !TIPOS_ACEITAVEIS.has(tipo)) return null;
  if (feito) return <span className="text-xs font-medium">Aceito como está</span>;
  const aceitar = async () => {
    if (!confirm(`${descricao}\n\nAceitar este conflito como está? Ele some da lista de conflitos. Se a grade mudar (outro dia, outra turma), ele volta a aparecer.`)) return;
    setGravando(true);
    try {
      await customFetch("/api/conflitos/aceitar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, descricao }) });
      setFeito(true);
      await queryClient.invalidateQueries({ queryKey: ["/api/conflitos/aceitos"] });
      toast({ title: "Conflito aceito como está", description: "Desfazer: aba Conflitos, em \"Aceitos como estão\"." });
      depois?.();
    } catch {
      toast({ title: "Não foi possível aceitar", description: "A grade pode ter mudado. Volte aos conflitos e clique em Reanalisar.", variant: "destructive" });
    } finally { setGravando(false); }
  };
  return (
    <button type="button" disabled={gravando} onClick={aceitar}
      className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50">
      {gravando ? "Aceitando…" : "Aceitar como está"}
    </button>
  );
}
