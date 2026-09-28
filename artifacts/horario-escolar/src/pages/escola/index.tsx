// [FASE-C1] Pagina "Escola": junta Dados da Escola, Configuracoes e Assinatura em
// abas, reaproveitando as telas que ja existiam (cada aba carrega sob demanda).
// Os enderecos antigos (/dados-escola, /configuracoes, /assinatura) redirecionam
// para a aba correspondente (ver App.tsx).
import { lazy, Suspense, useState } from "react";
import { useSearch } from "wouter";
import { Landmark, Settings, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const DadosEscolaPage = lazy(() => import("@/pages/dados-escola/index"));
const ConfiguracoesList = lazy(() => import("@/pages/configuracoes/index"));
const AssinaturaPage = lazy(() => import("@/pages/assinatura/index"));

const ABAS = [
  { key: "dados", label: "Dados da Escola", icon: Landmark },
  { key: "configuracoes", label: "Configurações", icon: Settings },
  { key: "assinatura", label: "Assinatura", icon: CreditCard },
] as const;
type AbaKey = (typeof ABAS)[number]["key"];

export default function EscolaPage() {
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const inicial = (ABAS.some((a) => a.key === tabParam) ? tabParam : "dados") as AbaKey;
  const [aba, setAba] = useState<AbaKey>(inicial);

  function trocarAba(k: AbaKey) {
    setAba(k);
    try { window.history.replaceState(null, "", `/escola?tab=${k}`); } catch { /* sem history */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Escola</h1>
        <p className="text-muted-foreground">Dados da escola, configurações e assinatura.</p>
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
        {aba === "dados" && <DadosEscolaPage />}
        {aba === "configuracoes" && <ConfiguracoesList />}
        {aba === "assinatura" && <AssinaturaPage />}
      </Suspense>
    </div>
  );
}