import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPlanos,
  useCadastrarEscola,
  getGetEscolaAtualQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Shield, Zap, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

// RF-ESC-01: primeiro cadastro da escola logo após o login. O projeto
// entra sempre no plano Piloto (gratuito) — os demais planos já aparecem
// aqui, mas ficam marcados como "em breve" até a cobrança (Stripe) ser
// habilitada numa fase de expansão SaaS futura.
const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const onboardingSchema = z.object({
  nomeFantasia: z.string().min(2, "Informe o nome da escola"),
  // [NOVO] RNF-SEG: obrigatório de propósito -- dificulta cadastro
  // descartável/em massa. Aceita com ou sem pontuação (12.345.678/0001-90
  // ou 12345678000190) -- só conta os dígitos, não valida na Receita.
  cnpj: z.string().refine((v) => v.replace(/\D/g, "").length === 14, "Informe um CNPJ válido (14 dígitos)"),
  cidade: z.string().optional(),
  estado: z.string().min(2),
  modalidade: z.enum(["regular", "tecnica", "eja", "normal_magisterio"]),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const ICONES_PLANO = { Gratuito: Shield, Pro: Zap, Master: Crown } as const;

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: planos, isLoading: carregandoPlanos } = useListPlanos();
  const cadastrarEscola = useCadastrarEscola();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { nomeFantasia: "", cnpj: "", cidade: "", estado: "PR", modalidade: "regular" },
  });

  function onSubmit(data: OnboardingFormValues) {
    cadastrarEscola.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Escola cadastrada! Você está no plano Piloto (gratuito)." });
          queryClient.invalidateQueries({ queryKey: getGetEscolaAtualQueryKey() });
          setLocation("/dashboard");
        },
        onError: () => {
          toast({ title: "Não foi possível concluir o cadastro", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1565C0] to-[#0D47A1] flex items-center justify-center">
              <span className="text-white font-black text-sm">N</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 font-heading">Bem-vindo(a) ao NexGrade</h1>
          </div>
          <p className="text-muted-foreground">
            Só precisamos de alguns dados para configurar sua escola. Você começa no Piloto, sem custo.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dados da escola</CardTitle>
            <CardDescription>Você pode alterar essas informações depois em Configurações.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="nomeFantasia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da escola</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex.: Colégio Estadual Exemplo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ</FormLabel>
                      <FormControl>
                        <Input placeholder="00.000.000/0001-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="cidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Opcional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="estado"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ESTADOS_BR.map((uf) => (
                              <SelectItem key={uf} value={uf}>
                                {uf}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="modalidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modalidade de ensino predominante</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="regular">Ensino Fundamental / Médio regular</SelectItem>
                          <SelectItem value="tecnica">Educação Técnica / Profissionalizante</SelectItem>
                          <SelectItem value="eja">Educação de Jovens e Adultos (EJA)</SelectItem>
                          <SelectItem value="normal_magisterio">Formação de Docentes (Normal/Magistério)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <h3 className="text-sm font-medium mb-3">Seu plano inicial</h3>
                  {carregandoPlanos ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-28 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {planos?.map((plano) => {
                        const Icone = ICONES_PLANO[plano.nome as keyof typeof ICONES_PLANO] ?? Shield;
                        // [FIX] Campo renomeado de "preco" pra "precoMensal"
                        // no backend hoje -- o tipo gerado pelo Orval ainda
                        // não foi regenerado (fica desatualizado até rodar
                        // o codegen de novo), então `plano.preco` compila
                        // sem erro mas vem sempre undefined em runtime,
                        // fazendo esse indicador nunca marcar o gratuito
                        // como selecionado. Acesso via cast até a próxima
                        // regeneração do client.
                        const gratuito = (plano as unknown as { precoMensal: number }).precoMensal === 0;
                        return (
                          <div
                            key={plano.id}
                            className={cn(
                              "rounded-lg border p-4 space-y-2",
                              gratuito ? "border-[#42A5F5] ring-2 ring-[#1565C0]/20 bg-[#1565C0]/5" : "opacity-70",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 font-medium">
                                <Icone className="w-4 h-4" />
                                {plano.nome}
                              </div>
                              {gratuito ? (
                                <Badge className="bg-[#1565C0]">Selecionado</Badge>
                              ) : (
                                <Badge variant="outline">Em breve</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Até {plano.maxProfessores >= 9999 ? "ilimitados" : plano.maxProfessores} professores ·{" "}
                              {plano.maxTurmas >= 9999 ? "turmas ilimitadas" : `${plano.maxTurmas} turmas`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Todo novo cadastro começa no plano Piloto, gratuito, enquanto o NexGrade está em fase de
                    validação com escolas parceiras. Você poderá migrar de plano quando a assinatura for
                    habilitada.
                  </p>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button type="submit" size="lg" disabled={cadastrarEscola.isPending}>
                    {cadastrarEscola.isPending ? "Configurando..." : "Começar a usar o NexGrade"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
