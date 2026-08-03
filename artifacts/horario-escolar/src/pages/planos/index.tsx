import { useState } from "react";
import { Link } from "wouter";
import {
  customFetch,
  useListPlanos,
  useGetEscolaAtual,
  getGetEscolaAtualQueryKey,
} from "@workspace/api-client-react";
import type { Plano } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Zap, Crown, Shield, Copy, Mail, PartyPopper, ShieldCheck, Bolt } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONES: Record<string, typeof Shield> = { Gratuito: Shield, Pro: Zap, Master: Crown };
const DESCRICAO: Record<string, string> = {
  Gratuito: "Para começar e experimentar",
  Pro: "Para escolas em crescimento",
  Master: "Para redes escolares",
};
const DESTAQUE = "Pro"; // plano em destaque visual -- centralizado, com badge e borda colorida

function formatPreco(centavos: number, periodicidade: "mensal" | "anual") {
  if (centavos === 0) return "Gratuito";
  const valor = (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return periodicidade === "anual" ? `R$ ${valor}/ano` : `R$ ${valor}/mês`;
}

// Quantos meses o cliente "ganha de graça" pagando anual em vez de
// mensal -- ex: mensal 97 x 12 = 1164; anual 970 -> economiza 194,
// que é quase 2 meses (194/97 ≈ 2). Calculado, não fixo, pra não
// desatualizar se o desconto mudar.
function mesesGratis(precoMensal: number, precoAnual: number | null | undefined): number | null {
  if (!precoAnual || precoMensal === 0) return null;
  const economiaAnual = precoMensal * 12 - precoAnual;
  const meses = Math.round(economiaAnual / precoMensal);
  return meses > 0 ? meses : null;
}

function featuresDoPlano(p: Plano) {
  return [
    { ok: true, label: `Até ${p.maxProfessores >= 9999 ? "ilimitados" : p.maxProfessores} professores` },
    { ok: true, label: `Até ${p.maxTurmas >= 9999 ? "ilimitadas" : p.maxTurmas} turmas` },
    { ok: true, label: "Grade horária automática" },
    { ok: true, label: "Detecção de conflitos" },
    { ok: p.temExport, label: "Exportar CSV / SEED" },
    { ok: p.temImport, label: "Importação inteligente CSV" },
    { ok: p.temIA, label: "Assistente de IA" },
    { ok: p.nome === "Master", label: "Suporte prioritário" },
  ];
}

export default function PlanosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [periodicidade, setPeriodicidade] = useState<"mensal" | "anual">("mensal");

  const { data: planos, isLoading } = useListPlanos();
  const { data: escolaAtual } = useGetEscolaAtual({ query: { queryKey: getGetEscolaAtualQueryKey() } });
  const temContato = Boolean((escolaAtual as any)?.emailContato?.trim() || (escolaAtual as any)?.telefoneContato?.trim());

  // [FIX] Botão "Assinar" dependia de window.open(mailto:) -- além de
  // ser bloqueado como pop-up (já corrigido antes), mesmo depois de
  // corrigido só funciona se o computador tiver um app de e-mail
  // padrão configurado, o que não é garantido (confirmado: "Launched
  // external handler" no console, mas nada abre). Agora mostra uma
  // caixa com o e-mail pra copiar -- sempre funciona, não depende de
  // nada instalado -- mantendo um link mailto: real como atalho
  // opcional pra quem tiver e-mail configurado.
  const [planoInteresse, setPlanoInteresse] = useState<string | null>(null);
  const [assinandoId, setAssinandoId] = useState<number | null>(null);
  // [NOVO] RF-BILLING-ASAAS: substitui o antigo checkout do Stripe
  // (redirecionava pra tela hospedada, com sucesso/cancelamento via
  // URL). O Asaas não tem essa tela -- ele manda boleto/PIX direto pro
  // e-mail/WhatsApp da escola, então aqui só confirmamos que a
  // assinatura foi criada, sem redirecionamento.
  const [assinaturaCriada, setAssinaturaCriada] = useState<{ plano: string; mensagem: string } | null>(null);

  // [DECISÃO] RF-BILLING-ESTRATEGIA: com a base de clientes ainda em
  // fase de validação (piloto + prospects), o caminho principal é uma
  // conversa comercial, não self-service -- cada venda nesse estágio
  // vale mais como relacionamento (entender objeção, ajustar preço,
  // confirmar de onde sai a verba da escola) do que como transação
  // automática. A assinatura via Asaas fica disponível como atalho
  // secundário pra quem já confia no produto e não quer esperar.
  const assinarPlano = async (plano: Plano) => {
    setAssinandoId(plano.id);
    try {
      const resposta = await customFetch<{ mensagem: string; asaasSubscriptionId: string }>("/api/escolas/assinatura-asaas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planoId: plano.id, periodicidade }),
        responseType: "json",
      });
      queryClient.invalidateQueries({ queryKey: getGetEscolaAtualQueryKey() });
      setAssinaturaCriada({ plano: plano.nome, mensagem: resposta.mensagem });
    } catch (err) {
      toast({
        title: "Não foi possível criar a assinatura",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setAssinandoId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight font-heading">Planos NexGrade</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
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

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-[26rem] rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !planos || planos.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          Não foi possível carregar os planos agora. Tenta recarregar a página.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {planos.map((plano) => {
            const Icone = ICONES[plano.nome] ?? Shield;
            const emDestaque = plano.nome === DESTAQUE;
            const gratuito = plano.precoMensal === 0;
            const precoExibido = periodicidade === "anual" && plano.precoAnual ? plano.precoAnual : plano.precoMensal;
            const periodoExibido = periodicidade === "anual" && plano.precoAnual ? "anual" : "mensal";

            return (
              <Card
                key={plano.id}
                className={cn(
                  "relative flex flex-col transition-shadow",
                  emDestaque ? "border-[#42A5F5] ring-2 ring-[#1565C0] ring-offset-2 shadow-lg md:-translate-y-2" : "border-border",
                )}
              >
                {emDestaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-[#1565C0] text-white">
                    Mais popular
                  </div>
                )}
                <CardHeader className="text-center pb-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2", emDestaque ? "bg-[#1565C0]/10 text-[#1565C0]" : "bg-muted text-muted-foreground")}>
                    <Icone className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl">{plano.nome}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{formatPreco(precoExibido, periodoExibido)}</span>
                    {periodicidade === "anual" && plano.precoAnual && (
                      <p className="text-xs text-emerald-600 mt-1">
                        equivalente a {formatPreco(Math.round(plano.precoAnual / 12), "mensal")} — economize{" "}
                        {mesesGratis(plano.precoMensal, plano.precoAnual)} meses/ano
                      </p>
                    )}
                  </div>
                  <CardDescription className="mt-1">{DESCRICAO[plano.nome]}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-4">
                  <ul className="space-y-2 flex-1">
                    {featuresDoPlano(plano).map((f, i) => (
                      <li key={i} className={cn("flex items-center gap-2 text-sm", f.ok ? "text-foreground" : "text-muted-foreground line-through")}>
                        <CheckCircle2 className={cn("w-4 h-4 shrink-0", f.ok ? "text-emerald-500" : "text-muted-foreground/30")} />
                        {f.label}
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      variant={emDestaque ? "default" : gratuito ? "outline" : "outline"}
                      disabled={gratuito}
                      onClick={() => setPlanoInteresse(`${plano.nome} (${periodicidade === "anual" ? "anual" : "mensal"})`)}
                    >
                      {gratuito ? "Plano atual" : "Falar com a gente"}
                    </Button>

                    {!gratuito && (
                      <button
                        disabled={assinandoId === plano.id || !temContato}
                        onClick={() => assinarPlano(plano)}
                        className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
                      >
                        <Bolt className="w-3 h-3" />
                        {assinandoId === plano.id
                          ? "Criando assinatura..."
                          : temContato
                            ? "ou assine sozinha agora"
                            : (
                              <span>
                                ou{" "}
                                <Link href="/configuracoes" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                                  complete seu contato
                                </Link>{" "}
                                pra assinar sozinha
                              </span>
                            )}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-500" /> 30 dias de avaliação gratuita</span>
        <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Cancele quando quiser</span>
        <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Sem fidelidade</span>
      </div>

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

      <Dialog open={assinaturaCriada !== null} onOpenChange={(open) => !open && setAssinaturaCriada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PartyPopper className="w-5 h-5 text-[#1565C0]" />
              Assinatura do plano {assinaturaCriada?.plano} criada
            </DialogTitle>
            <DialogDescription>{assinaturaCriada?.mensagem}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O plano só vira ativo depois que o pagamento for confirmado — fica de olho no e-mail/WhatsApp
            cadastrado. Sem confirmação de pagamento, a escola continua no Piloto normalmente.
          </p>
          <DialogFooter>
            <Button onClick={() => setAssinaturaCriada(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
