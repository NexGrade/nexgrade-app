import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCadastrarEscola,
  getGetEscolaAtualQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// RF-ESC-01: primeiro cadastro da escola logo após o login. O projeto
// entra sempre no plano Piloto (gratuito). A seleção de planos pagos foi
// removida do onboarding (cobrança desativada); todo cadastro novo é
// automaticamente Piloto.
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
  // [NOVO] RF-BILLING-ASAAS: opcionais aqui de propósito -- a escola
  // começa no Piloto gratuito e não precisa disso ainda. Só vira
  // obrigatório na hora de assinar um plano pago (ver validação em
  // routes/escolas.ts, rota POST /assinatura-asaas). Pode ser
  // preenchido depois em Configurações ou pelo Painel Master.
  emailContato: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefoneContato: z.string().optional(),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cadastrarEscola = useCadastrarEscola();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { nomeFantasia: "", cnpj: "", cidade: "", estado: "PR", modalidade: "regular", emailContato: "", telefoneContato: "" },
  });

  function onSubmit(data: OnboardingFormValues) {
    cadastrarEscola.mutate(
      {
        data: {
          ...data,
          emailContato: data.emailContato?.trim() || undefined,
          telefoneContato: data.telefoneContato?.trim() || undefined,
        },
      },
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="emailContato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail de contato</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="secretaria@escola.pr.gov.br" {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Usado pra enviar boleto/PIX quando você assinar um plano pago. Pode preencher depois.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="telefoneContato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp de contato</FormLabel>
                        <FormControl>
                          <Input placeholder="(41) 99999-9999" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
