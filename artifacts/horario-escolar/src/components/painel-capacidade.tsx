import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

// [CAPACIDADE-PROFESSOR] Painel de pre-validacao mostrado antes de gerar a
// grade: para cada professor, aulas + hora-atividade exigida contra os
// horarios livres de verdade (GET /api/horarios/capacidade). So leitura.

interface ProblemaCapacidade {
  professorId: number;
  professor: string;
  nivel: "erro" | "aviso";
  mensagem: string;
  aulasTotal: number;
  haExigida: number;
}

interface RespostaCapacidade {
  erros: number;
  avisos: number;
  problemas: ProblemaCapacidade[];
}

const NOME_TURNO: Record<string, string> = { matutino: "manhã", vespertino: "tarde", noturno: "noite" };

// [CAPACIDADE-POR-TURNO] com `turno`, mostra so os professores e a conta desse turno
export function PainelCapacidade({ turno }: { turno?: string } = {}) {
  const [verAvisos, setVerAvisos] = useState(false);
  const url = turno ? `/api/horarios/capacidade?turno=${encodeURIComponent(turno)}` : "/api/horarios/capacidade";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/horarios/capacidade", turno ?? "todos"],
    queryFn: () => customFetch<RespostaCapacidade>(url, { responseType: "json" }),
    staleTime: 0,
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Verificando a capacidade dos professores...</div>;
  }
  if (isError || !data) {
    return (
      <div className="text-xs text-muted-foreground">
        Não foi possível verificar a capacidade dos professores agora. A geração funciona normalmente.
      </div>
    );
  }

  const erros = data.problemas.filter((p) => p.nivel === "erro");
  const avisos = data.problemas.filter((p) => p.nivel === "aviso");

  return (
    <div className="space-y-2">
      {erros.length === 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          {turno
            ? `Capacidade OK na ${NOME_TURNO[turno] ?? turno}: todos os professores deste turno têm horários livres para as aulas.`
            : "Capacidade OK: todos os professores têm horários livres suficientes para as aulas e a hora-atividade."}
        </div>
      ) : (
        <div className="space-y-1.5 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            {turno ? `${erros.length} professor(es) com HA faltando` : `${erros.length} professor(es) sem horário suficiente`}
          </div>
          <ul className="list-disc space-y-0.5 pl-5">
            {erros.map((p, i) => (
              <li key={`${p.professorId}-${i}`}>
                <span className="font-medium">{p.professor}:</span> {p.mensagem}
              </li>
            ))}
          </ul>
          <p className="text-red-700">
            A grade pode ser gerada, mas a hora-atividade desses professores vai ficar incompleta. Resolva liberando horários ou ajustando a carga.
          </p>
        </div>
      )}
      {avisos.length > 0 && (
        <div className={turno ? "rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground" : "rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"}>{/* [CAPACIDADE-HA-OUTRO-TURNO] por turno: HA* nao e problema, tom neutro */}
          <button
            type="button"
            onClick={() => setVerAvisos((v) => !v)}
            className="flex w-full items-center gap-1.5 text-left font-semibold"
          >
            {verAvisos ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {turno
              ? `${avisos.length} professor(es) com parte da HA em outro turno (HA*) -- sem problema`
              : `${avisos.length} professor(es) vão precisar de hora-atividade em contraturno`}
          </button>
          {verAvisos && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {avisos.map((p, i) => (
                <li key={`${p.professorId}-${i}`}>
                  <span className="font-medium">{p.professor}:</span> {p.mensagem}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
