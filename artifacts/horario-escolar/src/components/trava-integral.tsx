// [TRAVA-INTEGRAL] (11/11/2026, pedido da dona) Faixa da turma integral na Grade: travada (nada muda nela: aulas,
// horarios e professores) ou destravada por pouco tempo. So aparece se a escola tem turma integral.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSomenteConsultaGrade } from "@/lib/papeis";
import { useState } from "react";

type Situacao = { temIntegral: boolean; travada: boolean; turmas: { id: number; nome: string }[]; destrava: { ate: string; em: string; por: string | null } | null };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function TravaIntegral() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const somenteConsulta = useSomenteConsultaGrade();
  const [ocupado, setOcupado] = useState(false);
  const q = useQuery({
    queryKey: ["trava-integral"],
    queryFn: () => customFetch<Situacao>("/api/horarios/trava-integral"),
    refetchInterval: 60_000, // a destrava vence sozinha
  });
  const s = q.data;
  if (!s?.temIntegral) return null;
  const nomes = s.turmas.map((t) => t.nome).join(", ");

  const mudar = async (acao: "destravar" | "travar") => {
    if (acao === "destravar" && !confirm(`Destravar ${nomes} (turma integral) por 1 hora?\n\nNesse tempo, as aulas, os horários e os professores dela podem ser mudados (gerar, rascunho, trocar aula, Turmas). Depois de 1 hora ela volta a travar sozinha.`)) return;
    setOcupado(true);
    try {
      const r = await customFetch<Situacao>(`/api/horarios/trava-integral/${acao}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(acao === "destravar" ? { horas: 1 } : {}),
      });
      qc.setQueryData(["trava-integral"], r);
      toast({ title: acao === "destravar" ? "Integral destravada por 1 hora" : "Integral travada", description: acao === "destravar" ? `Volta a travar sozinha às ${r.destrava ? hora(r.destrava.ate) : "?"}.` : "Nada muda nela até destravar de novo." });
    } catch (e) {
      toast({ title: "Não foi possível mudar a trava", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setOcupado(false); }
  };

  if (s.travada) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900">
        <span className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <span><strong>{nomes}</strong> (turma integral) está travada: aulas, horários e professores dela não mudam.</span>
        </span>
        {!somenteConsulta && (
          <button type="button" className="text-xs font-medium underline disabled:opacity-50" disabled={ocupado} onClick={() => mudar("destravar")}>
            Destravar a integral
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-2">
        <LockOpen className="h-4 w-4" />
        <span>
          <strong>{nomes}</strong> (turma integral) está <strong>destravada</strong> até {s.destrava ? hora(s.destrava.ate) : "?"}
          {s.destrava?.por ? ` (por ${s.destrava.por})` : ""}: as mudanças nela valem.
        </span>
      </span>
      {!somenteConsulta && (
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => mudar("travar")}>Travar agora</Button>
      )}
    </div>
  );
}
