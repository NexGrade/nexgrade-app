// [FASE-C2] Pagina "Cursos e Disciplinas": as duas telas sao usadas juntas (a
// matriz curricular de cada curso e montada a partir das disciplinas). Reaproveita
// as telas existentes em abas (carregadas sob demanda). /disciplinas redireciona
// para /cursos?tab=disciplinas (ver App.tsx).
import { lazy, Suspense, useState } from "react";
import { useSearch } from "wouter";
import { Library, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const CursosList = lazy(() => import("@/pages/cursos/index"));
const DisciplinasList = lazy(() => import("@/pages/disciplinas/index"));

const ABAS = [
  { key: "cursos", label: "Cursos e Matriz Curricular", icon: Library },
  { key: "disciplinas", label: "Disciplinas", icon: BookOpen },
] as const;
type AbaKey = (typeof ABAS)[number]["key"];

export default function CursosDisciplinasPage() {
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const inicial = (ABAS.some((a) => a.key === tabParam) ? tabParam : "cursos") as AbaKey;
  const [aba, setAba] = useState<AbaKey>(inicial);

  function trocarAba(k: AbaKey) {
    setAba(k);
    try { window.history.replaceState(null, "", `/cursos?tab=${k}`); } catch { /* sem history */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cursos e Disciplinas</h1>
        <p className="text-muted-foreground">Cursos, matrizes curriculares por série e o catálogo de disciplinas.</p>
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
        {aba === "cursos" && <CursosList />}
        {aba === "disciplinas" && <DisciplinasList />}
      </Suspense>
    </div>
  );
}