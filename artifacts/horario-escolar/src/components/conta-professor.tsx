import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

// [CONTA-NA-HORA] (01/11/2026) Na Disponibilidade: a cada bloqueio, se o professor ainda cabe no turno (aulas e HA
// contra horarios livres), antes de salvar e de gerar a grade. A conta salva vem do servidor
// (GET /api/horarios/capacidade/professor/:id, a mesma regra da tela de gerar); os cliques ainda nao salvos entram
// como `deltaLivres` (horarios que ficaram livres menos os que foram bloqueados neste turno).

type ContaTurno = {
  turno: string;
  nivel: "erro" | "aviso" | "ok";
  mensagem: string;
  aulasTotal: number;
  haExigida: number;
  livresPorTurno: Record<string, number>;
  livresComHA?: number;
};

const NOME_TURNO: Record<string, string> = { matutino: "manhã", vespertino: "tarde", noturno: "noite" };
const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function ContaProfessor({ professorId, turno, deltaLivres }: { professorId: number; turno: string; deltaLivres: number }) {
  const { data, isLoading, isError } = useQuery({
    // comeca com "/api/horarios/capacidade": invalidar essa chave (Salvar, tela de gerar) refaz esta conta tambem
    queryKey: ["/api/horarios/capacidade", "professor", professorId],
    queryFn: () => customFetch<{ turnos: ContaTurno[] }>(`/api/horarios/capacidade/professor/${professorId}`, { responseType: "json" }),
    staleTime: 0,
  });
  if (isLoading || isError || !data) return null; // sem a conta, a tela segue como antes

  const atual = data.turnos.find((t) => t.turno === turno);
  const outros = data.turnos.filter((t) => t.turno !== turno && t.nivel !== "ok");
  const nomeT = NOME_TURNO[turno] ?? turno;

  let caixa: ReactNode = null;
  if (atual) {
    const aulas = atual.aulasTotal;
    const ha = atual.haExigida;
    const livresSalvos = atual.livresPorTurno[turno] ?? 0;
    const livres = livresSalvos + deltaLivres;
    const livresComHA = (atual.livresComHA ?? livresSalvos) + deltaLivres;
    const pendente = deltaLivres !== 0
      ? ` (com as mudanças ainda não salvas: eram ${pl(livresSalvos, "horário livre", "horários livres")}, agora ${livres})`
      : "";
    if (aulas > livres) {
      caixa = (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            <strong>Não cabe na {nomeT}:</strong> {pl(aulas, "aula", "aulas")} e só {pl(livres, "horário livre", "horários livres")}{pendente}.
            Faltam {pl(aulas - livres, "horário", "horários")}: com isso o motor vai responder que não existe grade. Libere horários ou passe aulas para outro professor.
          </span>
        </div>
      );
    } else if (aulas + ha > livresComHA) {
      caixa = (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Aulas cabem, a HA não toda:</strong> {pl(aulas, "aula", "aulas")} + {ha} HA na {nomeT} e {pl(livresComHA, "horário livre", "horários livres")}{pendente}.
            {" "}{pl(aulas + ha - livresComHA, "HA vai", "HA vão")} para outro turno (HA*) ou {aulas + ha - livresComHA === 1 ? "fica" : "ficam"} faltando.
          </span>
        </div>
      );
    } else {
      caixa = (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            <strong>Cabe na {nomeT}:</strong> {pl(aulas, "aula", "aulas")} + {ha} HA e {pl(livresComHA, "horário livre", "horários livres")}{pendente}: folga de {livresComHA - aulas - ha}.
          </span>
        </div>
      );
    }
  }

  if (!caixa && !outros.length) return null;
  return (
    <div className="space-y-1.5">
      {caixa}
      {outros.map((t) => (
        <div key={t.turno} className={`flex items-start gap-2 rounded-md border px-4 py-1.5 text-xs ${t.nivel === "erro" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong>{(NOME_TURNO[t.turno] ?? t.turno).replace(/^./, (c) => c.toUpperCase())} (já salvo):</strong> {t.mensagem}</span>
        </div>
      ))}
    </div>
  );
}
