import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Zap, Crown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type Plano = {
  id: number;
  nome: string;
  preco: number;
  maxProfessores: number;
  maxTurmas: number;
  temIA: boolean;
  temExport: boolean;
  temImport: boolean;
};

const ICONES = { Gratuito: Shield, Pro: Zap, Master: Crown };
const CORES = {
  Gratuito: "border-border",
  Pro: "border-[#42A5F5] ring-2 ring-[#1565C0] ring-offset-2",
  Master: "border-[#0D47A1]",
};
const BADGE = {
  Pro: { label: "Mais popular", color: "bg-[#1565C0] text-white" },
};

function formatPreco(centavos: number) {
  if (centavos === 0) return "Gratuito";
  return `R$ ${(centavos / 100).toFixed(0).replace(".", ",")}/mês`;
}

export default function PlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${basePath}/api/escolas/planos`)
      .then(r => r.json())
      .then(data => { setPlanos(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const features = (p: Plano) => [
    { ok: true, label: `Até ${p.maxProfessores >= 9999 ? "ilimitados" : p.maxProfessores} professores` },
    { ok: true, label: `Até ${p.maxTurmas >= 9999 ? "ilimitadas" : p.maxTurmas} turmas` },
    { ok: true, label: "Grade horária automática" },
    { ok: true, label: "Detecção de conflitos" },
    { ok: p.temExport, label: "Exportar CSV / SEED" },
    { ok: p.temImport, label: "Importação inteligente CSV" },
    { ok: p.temIA, label: "Assistente de IA" },
    { ok: p.nome === "Master", label: "Suporte prioritário" },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight font-heading">Planos NexGrade</h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          Comece gratuitamente. Escale quando precisar. Sem contratos de longo prazo.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-96 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {planos.map(plano => {
            const Icone = ICONES[plano.nome as keyof typeof ICONES] ?? Shield;
            const badge = BADGE[plano.nome as keyof typeof BADGE];
            const cor = CORES[plano.nome as keyof typeof CORES] ?? "border-border";
            const isPro = plano.nome === "Pro";
            return (
              <Card key={plano.id} className={cn("relative flex flex-col", cor)}>
                {badge && (
                  <div className={cn("absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full", badge.color)}>
                    {badge.label}
                  </div>
                )}
                <CardHeader className="text-center pb-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2", isPro ? "bg-[#1565C0]/10 text-[#1565C0]" : "bg-muted text-muted-foreground")}>
                    <Icone className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl">{plano.nome}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{formatPreco(plano.preco)}</span>
                  </div>
                  <CardDescription className="mt-1">
                    {plano.nome === "Gratuito" && "Para começar e experimentar"}
                    {plano.nome === "Pro" && "Para escolas em crescimento"}
                    {plano.nome === "Master" && "Para redes escolares"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                  <ul className="space-y-2 flex-1">
                    {features(plano).map((f, i) => (
                      <li key={i} className={cn("flex items-center gap-2 text-sm", f.ok ? "text-foreground" : "text-muted-foreground line-through")}>
                        <CheckCircle2 className={cn("w-4 h-4 shrink-0", f.ok ? "text-emerald-500" : "text-muted-foreground/30")} />
                        {f.label}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={cn("w-full mt-4", isPro ? "" : "variant-outline")}
                    variant={isPro ? "default" : "outline"}
                    onClick={() => {
                      if (plano.preco === 0) return;
                      window.open("mailto:contato@nexcoretecnologia.com.br?subject=Interesse no plano " + plano.nome, "_blank");
                    }}
                  >
                    {plano.preco === 0 ? "Plano atual" : `Assinar ${plano.nome}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Período de avaliação de 30 dias gratuito em todos os planos pagos. Cancele a qualquer momento.
      </p>
    </div>
  );
}
