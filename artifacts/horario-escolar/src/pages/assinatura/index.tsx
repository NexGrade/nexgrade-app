import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useCadastrarEscola, useGetEscolaAtual, getGetEscolaAtualQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Receipt, Save, ArrowRight } from "lucide-react";

function badgeAssinatura(status: string | null | undefined) {
  switch (status) {
    case "em_dia": return { label: "Em dia", className: "bg-[#1565C0] text-white" };
    case "atrasada": return { label: "Atrasada", variant: "destructive" as const };
    case "cancelada": return { label: "Cancelada", variant: "secondary" as const };
    case "pendente": return { label: "Pendente", variant: "outline" as const };
    default: return null;
  }
}

function formatPreco(centavos: number) {
  if (centavos === 0) return "Gratuito";
  return `R$ ${(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/mês`;
}

// [NOVO] RF-BILLING-ASAAS: junta contato de cobrança + resumo do
// plano num só lugar -- antes o contato ficava perdido dentro de
// Configurações (tela genérica de sistema) e não tinha nenhum resumo
// de assinatura fora do Painel Master (que só o admin da plataforma
// vê). Esta página é o que a própria escola enxerga sobre a cobrança
// dela.
export default function AssinaturaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: escolaAtual } = useGetEscolaAtual({ query: { queryKey: getGetEscolaAtualQueryKey() } });
  const cadastrarEscola = useCadastrarEscola();

  const [emailCobranca, setEmailCobranca] = useState("");
  const [telefoneContato, setTelefoneContato] = useState("");
  const [savingContato, setSavingContato] = useState(false);

  useEffect(() => {
    if (escolaAtual) {
      setEmailCobranca((escolaAtual as any).emailCobranca ?? "");
      setTelefoneContato((escolaAtual as any).telefoneContato ?? "");
    }
  }, [escolaAtual]);

  const handleSaveContato = async () => {
    if (!escolaAtual?.nomeFantasia) return;
    setSavingContato(true);
    try {
      await cadastrarEscola.mutateAsync({
        data: {
          nomeFantasia: escolaAtual.nomeFantasia,
          cnpj: (escolaAtual as any).cnpj ?? undefined,
          cidade: escolaAtual.cidade ?? undefined,
          estado: escolaAtual.estado,
          modalidade: escolaAtual.modalidade as any,
          emailCobranca: emailCobranca.trim() || undefined,
          telefoneContato: telefoneContato.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetEscolaAtualQueryKey() });
      toast({ title: "Contato de cobrança salvo!" });
    } catch (err) {
      toast({
        title: "Erro ao salvar o contato",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingContato(false);
    }
  };

  const plano = (escolaAtual as any)?.plano as { nome: string; precoMensal: number } | undefined;
  const badge = badgeAssinatura((escolaAtual as any)?.asaasStatusAssinatura);
  const vencimento = (escolaAtual as any)?.asaasProximoVencimento as string | null | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-[#1565C0]" /> Assinatura
        </h1>
        <p className="text-muted-foreground mt-1">Plano contratado e contato usado para cobrança.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plano atual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {plano ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">{plano.nome}</p>
                    <p className="text-sm text-muted-foreground">{formatPreco(plano.precoMensal)}</p>
                  </div>
                  {badge && (
                    <div className="text-right">
                      <Badge className={"className" in badge ? badge.className : undefined} variant={"variant" in badge ? badge.variant : undefined}>
                        {badge.label}
                      </Badge>
                      {vencimento && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Vence {new Date(vencimento).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Link href="/planos">
                  <Button variant="outline" className="w-full">
                    Ver planos <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4" /> Contato para Cobrança</CardTitle>
            <CardDescription>
              Usado especificamente pelo Asaas pra enviar o boleto/PIX. Pode ser diferente do e-mail de contato
              geral (esse fica em <Link href="/dados-escola" className="underline underline-offset-2">Dados da Escola</Link>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>E-mail de cobrança</Label>
              <Input type="email" placeholder="financeiro@escola.pr.gov.br" value={emailCobranca} onChange={(e) => setEmailCobranca(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input placeholder="(41) 99999-9999" value={telefoneContato} onChange={(e) => setTelefoneContato(e.target.value)} />
            </div>
            <Button
              size="sm"
              onClick={handleSaveContato}
              disabled={savingContato || !escolaAtual || (!emailCobranca.trim() && !telefoneContato.trim())}
            >
              <Save className="w-3.5 h-3.5 mr-2" />
              {savingContato ? "Salvando..." : "Salvar contato"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
