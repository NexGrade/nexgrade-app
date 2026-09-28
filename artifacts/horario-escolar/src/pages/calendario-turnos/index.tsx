// [FASE-C3] Pagina "Calendario e Turnos": a estrutura de tempo da escola -- os
// dias letivos (calendario) e os horarios das aulas em cada turno (esquema).
// As duas sao configuradas uma vez por ano, antes de gerar a grade. O esquema
// saiu de dentro do Horario (a funcao AbaEsquema continua la, so exportada).
import { lazy, Suspense, useState } from "react";
import { useSearch } from "wouter";
import { CalendarDays, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const CalendarioEscolarPage = lazy(() => import("@/pages/calendario/index"));
const AbaEsquema = lazy(() => import("@/pages/horario/index").then((m) => ({ default: m.AbaEsquema })));

const ABAS = [
  { key: "calendario", label: "Calendário letivo", icon: CalendarDays },
  { key: "turnos", label: "Esquema de aulas por turno", icon: Clock },
] as const;
type AbaKey = (typeof ABAS)[number]["key"];

export default function CalendarioTurnosPage() {
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const inicial = (ABAS.some((a) => a.key === tabParam) ? tabParam : "calendario") as AbaKey;
  const [aba, setAba] = useState<AbaKey>(inicial);

  function trocarAba(k: AbaKey) {
    setAba(k);
    try { window.history.replaceState(null, "", `/calendario?tab=${k}`); } catch { /* sem history */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendário e Turnos</h1>
        <p className="text-muted-foreground">Dias letivos do ano e os horários das aulas em cada turno.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => trocarAba(a.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              aba === a.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <a.icon className="w-4 h-4" />
            {a.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {aba === "calendario" && <CalendarioEscolarPage />}
        {aba === "turnos" && <AbaEsquema />}
      </Suspense>
    </div>
  );
}