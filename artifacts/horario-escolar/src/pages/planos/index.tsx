import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Zap, Crown, Shield, Copy, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type Plano = {
  id: number;
  nome: string;
  precoMensal: number;
  precoAnual: number | null;
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

function formatPreco(centavos: number, periodicidade: "mensal" | "anual") {
  if (centavos === 0) return "Gratuito";
  const valor = (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return periodicidade === "anual" ? `R$ ${valor}/ano` : `R$ ${valor}/mês`;
}

// Quantos meses o cliente "ganha de graça" pagando anual em vez de
// mensal -- ex: mensal 97 x 12 = 1164; anual 970 -> economiza 194,
// que é quase 2 meses (194/97 ≈ 2). Calculado, não fixo, pra não
// desatualizar se o desconto mudar.
function mesesGratis(precoMensal: number, precoAnual: number | null): number | null {
  if (!precoAnual || precoMensal === 0) return null;
  const economiaAnual = precoMensal * 12 - precoAnual;
  const meses = Math.round(economiaAnual / precoMensal);
  return meses > 0 ? meses : null;
}

export default function PlanosPage() {
  const { toast } = useToast();
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [periodicidade, setPeriodicidade] = useState<"mensal" | "anual">("mensal");
  const [loading, setLoading] = useState(true);
  // [FIX] Botão "Assinar" dependia de window.open(mailto:) -- além de
  // ser bloqueado como pop-up (já corrigido antes), mesmo depois de
  // corrigido só funciona se o computador tiver um app de e-mail
  // padrão configurado, o que não é garantido (confirmado: "Launched
  // external handler" no console, mas nada abre). Agora mostra uma
  // caixa com o e-mail pra copiar -- sempre funciona, não depende de
  // nada instalado -- mantendo um link mailto: real como atalho
  // opcional pra quem tiver e-mail configurado.
  const [planoInteresse, setPlanoInteresse] = useState<string | null>(null);

  useEffect(() => {
    // [FIX] Mesmo bug corrigido em pages/export/index.tsx: essa
    // chamada usava `fetch()` puro, sem o token Bearer que a API
    // exige (não usa cookie de sessão). Voltava 401, e o corpo do
    // erro (`{ error: "..." }`, um objeto) ia direto pro
    // `setPlanos(data)` -- planos deixava de ser array e o
    // `.map()` mais abaixo quebrava a tela inteira. `customFetch`
    // já anexa o token sozinho, igual toda chamada normal da API.
    customFetch<Plano[]>("/api/escolas/planos", { responseType: "json" })
      .then((data) => { setPlanos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setPlanos([]); setLoading(false); });
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

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setPeriodicidade("mensal")}
          className={cn(
            "text-sm font-medium px-4 py-1.5 rounded-full transition-colors",
            periodicidade === "mensal" ? "bg-[#1565C0] text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Mensal
        </button>
        <button
          onClick={() => setPeriodicidade("anual")}
          className={cn(
            "text-sm font-medium px-4 py-1.5 rounded-full transition-colors flex items-center gap-1.5",
            periodicidade === "anual" ? "bg-[#1565C0] text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Anual
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", periodicidade === "anual" ? "bg-white/20" : "bg-emerald-100 text-emerald-700")}>
            2 meses grátis
          </span>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-96 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : planos.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          Não foi possível carregar os planos agora. Tenta recarregar a página.
        </p>
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
                    <span className="text-3xl font-bold">
                      {formatPreco(periodicidade === "anual" && plano.precoAnual ? plano.precoAnual : plano.precoMensal, periodicidade === "anual" && plano.precoAnual ? "anual" : "mensal")}
                    </span>
                    {periodicidade === "anual" && plano.precoAnual && (
                      <p className="text-xs text-emerald-600 mt-1">
                        equivalente a {formatPreco(Math.round(plano.precoAnual / 12), "mensal")} — economize {mesesGratis(plano.precoMensal, plano.precoAnual)} meses/ano
                      </p>
                    )}
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
                      if (plano.precoMensal === 0) return;
                      setPlanoInteresse(`${plano.nome} (${periodicidade === "anual" ? "anual" : "mensal"})`);
                    }}
                  >
                    {plano.precoMensal === 0 ? "Plano atual" : `Assinar ${plano.nome}`}
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

      <Dialog open={planoInteresse !== null} onOpenChange={(open) => !open && setPlanoInteresse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#1565C0]" />
              Assinar plano {planoInteresse}
            </DialogTitle>
            <DialogDescription>
              Entre em contato com a gente pra ativar. Copia o e-mail abaixo ou, se preferir, use o link pra abrir direto no seu aplicativo de e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
            <span className="flex-1 text-sm font-medium">contato@nexuscoretecnologia.com.br</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText("contato@nexuscoretecnologia.com.br");
                toast({ title: "E-mail copiado!" });
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />Copiar
            </Button>
          </div>
          <DialogFooter className="sm:justify-start">
            <a
              href={`mailto:contato@nexuscoretecnologia.com.br?subject=${encodeURIComponent(`Interesse no plano ${planoInteresse}`)}`}
              className="text-sm text-[#1565C0] hover:underline"
            >
              ou abrir no meu aplicativo de e-mail →
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

