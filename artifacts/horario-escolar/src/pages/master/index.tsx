import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEscolasMaster, useUpdateEscolaMaster, getListEscolasMasterQueryKey,
  useListPlanosMaster, useCreatePlano, useUpdatePlano, getListPlanosMasterQueryKey,
  useGetMasterMetrics, getGetMasterMetricsQueryKey,
  // [ATENÇÃO] Nome do hook a confirmar depois de rodar o codegen do
  // Orval pra rota nova POST /master/escolas/:id/cancelar-assinatura-
  // asaas -- o Orval deriva o nome do operationId do OpenAPI, então
  // pode sair diferente do que estou assumindo aqui. Ajustar o import
  // (e as duas referências abaixo) se o nome gerado for outro.
  useCancelarAssinaturaAsaasMaster,
  customFetch, // [NOVA-ESCOLA-MASTER]
} from "@workspace/api-client-react";
import { useEu } from "@/lib/papeis"; // [MASTER-SUPORTE]
import { trocarDeEscola } from "@/lib/escola-ativa"; // [MASTER-SUPORTE]
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2, Users, GraduationCap, CalendarDays, Sparkles, ShieldCheck, Plus, Pencil, XCircle,
  Search, MapPin, Mail, Phone, KeyRound, // [MASTER-LAYOUT]
  LogIn, LifeBuoy, // [MASTER-SUPORTE]
} from "lucide-react";

// RF-MASTER-01 a RF-MASTER-03: painel administrativo da plataforma —
// visão de todas as escolas, gestão de planos, e métricas agregadas de
// uso. Opera fora do isolamento por escola de propósito (ver
// middlewares/requireMaster.ts no backend); o acesso a esta página é
// controlado pelo mesmo mecanismo, verificado antes de renderizar (ver
// EscolaGate/MasterGate em App.tsx).
export default function MasterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-heading">
          <ShieldCheck className="w-6 h-6 text-[#0D47A1]" />
          Painel Master
        </h1>
        <p className="text-muted-foreground">Administração da plataforma NexGrade — todas as escolas. Para trabalhar dentro de uma escola, use "Abrir escola" na ficha dela.</p>
      </div>

      <MetricasCards />

      <Tabs defaultValue="escolas">
        <TabsList>
          <TabsTrigger value="escolas">Escolas</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
        </TabsList>
        <TabsContent value="escolas" className="mt-4">
          <EscolasTable />
        </TabsContent>
        <TabsContent value="planos" className="mt-4">
          <PlanosTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricasCards() {
  const { data, isLoading } = useGetMasterMetrics({ query: { queryKey: getGetMasterMetricsQueryKey() } });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const cards = [
    { label: "Escolas", value: data.totalEscolas, sub: `${data.escolasAtivas} ativas · ${data.escolasInativas} inativas`, icon: Building2 },
    { label: "Em período de avaliação", value: data.escolasEmTrial, sub: "escolas em trial", icon: CalendarDays },
    { label: "Professores cadastrados", value: data.totalProfessores, sub: `em ${data.totalTurmas} turmas`, icon: Users },
    { label: "Aulas na grade", value: data.totalAulasDistribuidas, sub: "na grade oficial das escolas", icon: GraduationCap },
    // [MASTER-LAYOUT] e o total de contas de login no Clerk (quem ja criou conta), nao de acessos as escolas
    { label: "Contas de login", value: data.totalUsuarios, sub: "pessoas que já criaram conta", icon: KeyRound },
    { label: "Mensagens ao Assistente de IA", value: data.mensagensEnviadasParaIA, sub: "desde o início", icon: Sparkles },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{c.sub}</p>
              </div>
              <c.icon className="w-8 h-8 text-muted-foreground/40" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// [FIX] "preco" foi renomeado pra "precoMensal" no schema (RF-BILLING),
// junto com precoAnual novo. Essa função agora mostra os dois quando o
// anual existir.
function formatPreco(precoMensal: number, precoAnual?: number | null) {
  if (precoMensal === 0) return "Gratuito";
  const mensal = `R$ ${(precoMensal / 100).toFixed(2).replace(".", ",")}/mês`;
  if (!precoAnual) return mensal;
  const anual = `R$ ${(precoAnual / 100).toFixed(2).replace(".", ",")}/ano`;
  return `${mensal} · ${anual}`;
}

// [NOVO] RF-BILLING-ASAAS: traduz o status bruto salvo pelo webhook
// (routes/asaas-webhook.ts) pro badge exibido, no mesmo modelo do
// Painel Central do Nex Reserva.
function badgeAssinatura(status: string | null | undefined) {
  switch (status) {
    case "em_dia": return { label: "Em dia", className: "bg-[#1565C0] text-white" };
    case "atrasada": return { label: "Atrasada", variant: "destructive" as const };
    case "cancelada": return { label: "Cancelada", variant: "secondary" as const };
    case "pendente": return { label: "Pendente", variant: "outline" as const };
    default: return { label: "Sem assinatura", variant: "outline" as const };
  }
}

function formatVencimento(data: string | null | undefined) {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
}

function EscolasTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: escolas, isLoading } = useListEscolasMaster({ query: { queryKey: getListEscolasMasterQueryKey() } });
  const { data: planos } = useListPlanosMaster({ query: { queryKey: getListPlanosMasterQueryKey() } });
  const atualizar = useUpdateEscolaMaster();
  const cancelarAssinatura = useCancelarAssinaturaAsaasMaster();
  const [escolaEditandoContato, setEscolaEditandoContato] = useState<string | null>(null);
  const [busca, setBusca] = useState(""); // [MASTER-LAYOUT]
  const [novaAberta, setNovaAberta] = useState(false); // [NOVA-ESCOLA-MASTER]
  // [MASTER-SUPORTE] escolas em que a Nexus Core ja tem acesso (visivel em Usuarios da escola)
  const { data: eu } = useEu();
  const pelobanco = !!eu?.pelobanco;
  const comAcesso = new Set(eu?.pelobanco ? eu.escolas.map((x) => x.escolaId) : []);
  const [liberando, setLiberando] = useState<string | null>(null);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function liberarSuporte(id: string, nome: string) {
    if (!window.confirm("Liberar o seu acesso de suporte em " + nome + "?\n\nEle fica visível para a escola em Usuários, como \"Nexus Core (suporte)\", com cargo Coordenação. A escola pode remover quando quiser.")) return;
    setLiberando(id);
    try {
      const r = await customFetch<{ mensagem?: string }>("/api/master/escolas/" + encodeURIComponent(id) + "/meu-acesso", { method: "POST", responseType: "json" });
      toast({ title: "Acesso de suporte liberado", description: r?.mensagem });
      trocarDeEscola(id, basePath);
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: "Não foi possível liberar", description: e?.data?.error ?? e?.message ?? "Tente novamente.", variant: "destructive" });
      setLiberando(null);
    }
  }

  function salvarContato(id: string, emailContato: string, telefoneContato: string) {
    atualizar.mutate(
      {
        id,
        data: {
          emailContato: emailContato.trim() || null,
          telefoneContato: telefoneContato.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Contato atualizado" });
          setEscolaEditandoContato(null);
          queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao atualizar o contato", variant: "destructive" }),
      },
    );
  }

  function cancelarAssinaturaDaEscola(id: string, nomeFantasia: string) {
    if (!window.confirm(`Cancelar a assinatura Asaas de "${nomeFantasia}"? Isso encerra a cobrança recorrente de verdade, não é reversível por aqui.`)) {
      return;
    }
    cancelarAssinatura.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Assinatura cancelada no Asaas" });
          queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao cancelar a assinatura", variant: "destructive" }),
      },
    );
  }

  function alternarAtiva(id: string, planoAtivo: boolean) {
    atualizar.mutate(
      { id, data: { planoAtivo } },
      {
        onSuccess: () => {
          toast({ title: planoAtivo ? "Escola reativada" : "Escola desativada" });
          queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao atualizar a escola", variant: "destructive" }),
      },
    );
  }

  // [NOVO] Isenta = fora do fluxo normal de trial/cobrança -- nenhuma
  // trava de acesso por vencimento de trial ou falta de plano pago
  // encosta nessa escola (ver routes/matrizes-oficiais.ts no backend,
  // que já checa esse campo). Uso: escola piloto, parceria, cortesia.
  function alternarIsenta(id: string, isenta: boolean) {
    atualizar.mutate(
      { id, data: { isenta } },
      {
        onSuccess: () => {
          toast({ title: isenta ? "Escola marcada como isenta" : "Isenção removida" });
          queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao atualizar isenção", variant: "destructive" }),
      },
    );
  }

  function mudarPlano(id: string, planoId: string) {
    atualizar.mutate(
      { id, data: { planoId: planoId ? Number(planoId) : null } },
      {
        onSuccess: () => {
          toast({ title: "Plano atualizado" });
          queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao atualizar o plano", variant: "destructive" }),
      },
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  // [MASTER-LAYOUT] (15/10/2026) uma ficha por escola em vez da tabela de 10 colunas, que
  // cortava a ultima coluna e quebrava o nome da escola palavra por palavra. A antiga tambem
  // tinha os cabecalhos "Assinatura" e "Isenta" trocados em relacao ao conteudo.
  const termo = busca.trim().toLowerCase();
  const lista = (escolas ?? []).filter((e) =>
    !termo || e.nomeFantasia.toLowerCase().includes(termo) || (e.cidade ?? "").toLowerCase().includes(termo),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar escola ou cidade..." value={busca} onChange={(ev) => setBusca(ev.target.value)} aria-label="Buscar escola" />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {lista.length} de {escolas?.length ?? 0} escola{(escolas?.length ?? 0) === 1 ? "" : "s"}
          </p>
          <Button className="gap-1.5" onClick={() => setNovaAberta(true)}>
            <Plus className="h-4 w-4" /> Nova escola
          </Button>
        </div>
      </div>

      <NovaEscolaDialog aberto={novaAberta} onOpenChange={setNovaAberta} />

      {lista.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {escolas?.length ? "Nenhuma escola encontrada nessa busca." : "Nenhuma escola cadastrada na plataforma ainda."}
          </CardContent>
        </Card>
      )}

      {lista.map((e) => {
        const ex = e as typeof e & {
          emailContato?: string | null; telefoneContato?: string | null; isenta?: boolean;
          asaasStatusAssinatura?: string | null; asaasProximoVencimento?: string | null; asaasSubscriptionId?: string | null;
        };
        const badge = badgeAssinatura(ex.asaasStatusAssinatura);
        const plano = planos?.find((p) => p.id === e.planoId);
        return (
          <Card key={e.id} className={e.planoAtivo ? undefined : "opacity-75"}>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug">{e.nomeFantasia}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />{e.cidade ?? "—"}/{e.estado}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {pelobanco && (comAcesso.has(e.id) ? (
                    <Button size="sm" className="h-8 gap-1.5" onClick={() => trocarDeEscola(e.id, basePath)}>
                      <LogIn className="h-3.5 w-3.5" /> Abrir escola
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={liberando === e.id} onClick={() => liberarSuporte(e.id, e.nomeFantasia)}>
                      <LifeBuoy className="h-3.5 w-3.5" /> {liberando === e.id ? "Liberando..." : "Liberar meu acesso de suporte"}
                    </Button>
                  ))}
                  <Badge className={e.planoAtivo ? "bg-emerald-600 text-white hover:bg-emerald-600" : undefined} variant={e.planoAtivo ? undefined : "secondary"}>
                    {e.planoAtivo ? "Ativa" : "Suspensa"}
                  </Badge>
                  {ex.isenta && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Isenta de cobrança</Badge>}
                  <Badge className={"className" in badge ? badge.className : undefined} variant={"variant" in badge ? badge.variant : undefined}>
                    {badge.label}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uso</p>
                  <div className="flex gap-4 text-sm">
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" /><strong>{e.totalProfessores}</strong> professores</span>
                    <span className="flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-muted-foreground" /><strong>{e.totalTurmas}</strong> turmas</span>
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contato</p>
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 text-sm">
                      <p className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{ex.emailContato ?? <span className="text-muted-foreground">sem e-mail</span>}</p>
                      <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" />{ex.telefoneContato ?? "sem telefone"}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEscolaEditandoContato(e.id)} aria-label={"Editar contato de " + e.nomeFantasia}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={"plano-" + e.id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plano</Label>
                  <select
                    id={"plano-" + e.id}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={e.planoId ?? ""}
                    onChange={(ev) => mudarPlano(e.id, ev.target.value)}
                  >
                    <option value="">Sem plano</option>
                    {planos?.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{plano ? formatPreco(plano.precoMensal, plano.precoAnual) : "—"}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assinatura</p>
                  <p className="text-sm">Próximo vencimento: <strong>{formatVencimento(ex.asaasProximoVencimento)}</strong></p>
                  {ex.asaasSubscriptionId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="-ml-2 h-8 gap-1 text-destructive hover:text-destructive"
                      disabled={cancelarAssinatura.isPending}
                      onClick={() => cancelarAssinaturaDaEscola(e.id, e.nomeFantasia)}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancelar assinatura
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
                <label className="flex items-start gap-3 text-sm">
                  <Switch checked={e.planoAtivo} onCheckedChange={(v) => alternarAtiva(e.id, v)} aria-label={"Escola ativa: " + e.nomeFantasia} />
                  <span>
                    <span className="font-medium">Escola ativa</span>
                    <span className="block text-xs text-muted-foreground">Desligado = escola suspensa, sem acesso ao sistema.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <Switch checked={ex.isenta ?? false} onCheckedChange={(v) => alternarIsenta(e.id, v)} aria-label={"Isenta de cobrança: " + e.nomeFantasia} />
                  <span>
                    <span className="font-medium">Isenta de cobrança</span>
                    <span className="block text-xs text-muted-foreground">Escola piloto, parceria ou cortesia: sem bloqueio por trial ou pagamento.</span>
                  </span>
                </label>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {escolaEditandoContato && (
        <ContatoDialog
          escola={escolas!.find((e) => e.id === escolaEditandoContato)!}
          salvando={atualizar.isPending}
          onOpenChange={(v) => !v && setEscolaEditandoContato(null)}
          onSalvar={salvarContato}
        />
      )}
    </div>
  );
}

// [NOVA-ESCOLA-MASTER] (15/10/2026) Cadastro de escola nova pela Nexus Core. A escola nasce
// com plano Gratuito, 30 dias de avaliacao e o catalogo oficial SEED-PR; o e-mail da direcao
// ja fica liberado para entrar (e o seu, como coordenacao, se marcado).
const TURNOS_OPCOES = [
  { valor: "matutino", rotulo: "Manhã" },
  { valor: "vespertino", rotulo: "Tarde" },
  { valor: "noturno", rotulo: "Noite" },
] as const;
type NovaEscolaForm = {
  nomeFantasia: string; cnpj: string; codigoInep: string; cidade: string; estado: string; nre: string;
  turnosOfertados: string[]; emailContato: string; telefoneContato: string;
  direcaoNome: string; direcaoEmail: string; incluirMe: boolean; isenta: boolean;
};
const NOVA_ESCOLA_VAZIA: NovaEscolaForm = {
  nomeFantasia: "", cnpj: "", codigoInep: "", cidade: "", estado: "PR", nre: "",
  turnosOfertados: ["matutino", "vespertino"], emailContato: "", telefoneContato: "",
  direcaoNome: "", direcaoEmail: "", incluirMe: true, isenta: false,
};

function NovaEscolaDialog({ aberto, onOpenChange }: { aberto: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [f, setF] = useState<NovaEscolaForm>(NOVA_ESCOLA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof NovaEscolaForm) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value });
  const digitos = (v: string) => v.replace(/\D/g, "");
  const pronto =
    f.nomeFantasia.trim().length >= 3 && digitos(f.cnpj).length === 14 && f.cidade.trim().length >= 2 &&
    (!f.codigoInep || digitos(f.codigoInep).length === 8) && f.turnosOfertados.length > 0 &&
    f.direcaoNome.trim().length >= 2 && f.direcaoEmail.includes("@");

  async function salvar() {
    setSalvando(true);
    try {
      const r = await customFetch<{ mensagem?: string }>("/api/master/escolas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
        responseType: "json",
      });
      toast({ title: "Escola cadastrada", description: r?.mensagem });
      queryClient.invalidateQueries({ queryKey: getListEscolasMasterQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMasterMetricsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["eu"] }); // a escola nova aparece no seletor do topo
      setF(NOVA_ESCOLA_VAZIA);
      onOpenChange(false);
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: "Não foi possível cadastrar", description: e?.data?.error ?? e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova escola</DialogTitle>
          <DialogDescription>
            A escola começa no plano Gratuito, com 30 dias de avaliação e o catálogo oficial SEED-PR. A direção entra no NexGrade com o e-mail informado abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escola</p>
            <div className="space-y-1">
              <Label htmlFor="ne-nome">Nome da escola</Label>
              <Input id="ne-nome" placeholder="C.E. Prof. Fulano de Tal" value={f.nomeFantasia} onChange={campo("nomeFantasia")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ne-cnpj">CNPJ</Label>
                <Input id="ne-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" value={f.cnpj} onChange={campo("cnpj")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ne-inep">Código INEP</Label>
                <Input id="ne-inep" inputMode="numeric" placeholder="8 números" value={f.codigoInep} onChange={campo("codigoInep")} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_90px_1fr]">
              <div className="space-y-1">
                <Label htmlFor="ne-cidade">Cidade</Label>
                <Input id="ne-cidade" value={f.cidade} onChange={campo("cidade")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ne-uf">UF</Label>
                <Input id="ne-uf" maxLength={2} value={f.estado} onChange={(ev) => setF({ ...f, estado: ev.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ne-nre">NRE</Label>
                <Input id="ne-nre" placeholder="Área Metropolitana Norte" value={f.nre} onChange={campo("nre")} />
              </div>
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Turnos ofertados</legend>
              <div className="flex flex-wrap gap-4 pt-1">
                {TURNOS_OPCOES.map((t) => (
                  <label key={t.valor} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={f.turnosOfertados.includes(t.valor)}
                      onChange={(ev) => setF({
                        ...f,
                        turnosOfertados: ev.target.checked
                          ? TURNOS_OPCOES.map((o) => o.valor).filter((v) => v === t.valor || f.turnosOfertados.includes(v))
                          : f.turnosOfertados.filter((v) => v !== t.valor),
                      })}
                    />
                    {t.rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ne-email">E-mail da escola (cobrança e avisos)</Label>
                <Input id="ne-email" type="email" placeholder="escola@seed.pr.gov.br" value={f.emailContato} onChange={campo("emailContato")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ne-tel">Telefone / WhatsApp</Label>
                <Input id="ne-tel" placeholder="(41) 3333-3333" value={f.telefoneContato} onChange={campo("telefoneContato")} />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primeiro acesso</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ne-dnome">Nome da direção</Label>
                <Input id="ne-dnome" value={f.direcaoNome} onChange={campo("direcaoNome")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ne-demail">E-mail da direção</Label>
                <Input id="ne-demail" type="email" placeholder="nome@escola.pr.gov.br" value={f.direcaoEmail} onChange={campo("direcaoEmail")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">A direção poderá liberar o restante da equipe em Usuários; os professores entram pelo e-mail do cadastro de Professores.</p>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={f.incluirMe} onCheckedChange={(v) => setF({ ...f, incluirMe: v })} />
              <span>
                <span className="font-medium">Incluir meu acesso (coordenação)</span>
                <span className="block text-xs text-muted-foreground">Para a Nexus Core montar a escola e dar suporte.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={f.isenta} onCheckedChange={(v) => setF({ ...f, isenta: v })} />
              <span>
                <span className="font-medium">Isenta de cobrança</span>
                <span className="block text-xs text-muted-foreground">Escola piloto, parceria ou cortesia.</span>
              </span>
            </label>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={!pronto || salvando}>
            {salvando ? "Cadastrando..." : "Cadastrar escola"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// [NOVO] RF-BILLING-ASAAS: edição de e-mail/telefone pelo Master, pra
// escolas cadastradas antes desse campo existir no onboarding -- sem
// isso a rota de assinatura Asaas fica bloqueada pra elas.
function ContatoDialog({
  escola, salvando, onOpenChange, onSalvar,
}: {
  escola: { id: string; nomeFantasia: string; emailContato?: string | null; telefoneContato?: string | null };
  salvando: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvar: (id: string, emailContato: string, telefoneContato: string) => void;
}) {
  const [email, setEmail] = useState(escola.emailContato ?? "");
  const [telefone, setTelefone] = useState(escola.telefoneContato ?? "");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contato — {escola.nomeFantasia}</DialogTitle>
          <DialogDescription>Usado pelo Asaas pra notificar a escola com boleto/PIX das cobranças.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">E-mail</Label>
            <Input type="email" placeholder="secretaria@escola.pr.gov.br" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">WhatsApp</Label>
            <Input placeholder="(41) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onSalvar(escola.id, email, telefone)} disabled={salvando || (!email.trim() && !telefone.trim())}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// [NOVO] Estado do formulário em reais (mais fácil de digitar) --
// convertido pra centavos só na hora de mandar pro backend.
type PlanoFormState = {
  nome: string;
  precoMensalReais: string;
  precoAnualReais: string;
  maxProfessores: number;
  maxTurmas: number;
  temIA: boolean;
  temExport: boolean;
  temImport: boolean;
  ativo: boolean;
};

const FORM_VAZIO: PlanoFormState = {
  nome: "", precoMensalReais: "0", precoAnualReais: "",
  maxProfessores: 10, maxTurmas: 5,
  temIA: false, temExport: false, temImport: false, ativo: true,
};

function reaisParaCentavos(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// [NOVO] Formulário compartilhado entre "Novo plano" e "Editar plano"
// -- antes só existia criação, sem jeito de editar preço/limites de
// um plano depois de criado (precisava de script direto no banco).
function PlanoFormDialog({
  aberto, onOpenChange, titulo, valorInicial, aoSalvar, salvando,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  valorInicial: PlanoFormState;
  aoSalvar: (v: PlanoFormState) => void;
  salvando: boolean;
}) {
  const [form, setForm] = useState(valorInicial);

  return (
    <Dialog open={aberto} onOpenChange={(v) => { setForm(valorInicial); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Preço em reais.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Nome do plano" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Preço mensal (R$)</Label>
              <Input type="text" inputMode="decimal" value={form.precoMensalReais}
                onChange={(e) => setForm({ ...form, precoMensalReais: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Preço anual (R$, opcional)</Label>
              <Input type="text" inputMode="decimal" placeholder="deixe em branco se não tiver" value={form.precoAnualReais}
                onChange={(e) => setForm({ ...form, precoAnualReais: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Máx. professores</Label>
              <Input type="number" value={form.maxProfessores} onChange={(e) => setForm({ ...form, maxProfessores: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Máx. turmas</Label>
              <Input type="number" value={form.maxTurmas} onChange={(e) => setForm({ ...form, maxTurmas: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.temIA} onCheckedChange={(v) => setForm({ ...form, temIA: v })} /> Assistente de IA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.temExport} onCheckedChange={(v) => setForm({ ...form, temExport: v })} /> Exportar
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.temImport} onCheckedChange={(v) => setForm({ ...form, temImport: v })} /> Importar
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => aoSalvar(form)} disabled={salvando || !form.nome.trim()}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanosTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: planos, isLoading } = useListPlanosMaster({ query: { queryKey: getListPlanosMasterQueryKey() } });
  const atualizar = useUpdatePlano();
  const criar = useCreatePlano();

  const [dialogNovoAberto, setDialogNovoAberto] = useState(false);
  const [planoEditando, setPlanoEditando] = useState<number | null>(null);

  function alternarAtivo(id: number, ativo: boolean, nome: string) {
    atualizar.mutate(
      { id, data: { nome, ativo } },
      {
        onSuccess: () => {
          toast({ title: ativo ? "Plano reativado" : "Plano desativado" });
          queryClient.invalidateQueries({ queryKey: getListPlanosMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao atualizar o plano", variant: "destructive" }),
      },
    );
  }

  function montarPayload(form: PlanoFormState) {
    return {
      nome: form.nome.trim(),
      precoMensal: reaisParaCentavos(form.precoMensalReais),
      precoAnual: form.precoAnualReais.trim() ? reaisParaCentavos(form.precoAnualReais) : null,
      maxProfessores: form.maxProfessores,
      maxTurmas: form.maxTurmas,
      temIA: form.temIA,
      temExport: form.temExport,
      temImport: form.temImport,
      ativo: form.ativo,
    };
  }

  function criarPlano(form: PlanoFormState) {
    criar.mutate(
      { data: montarPayload(form) as any },
      {
        onSuccess: () => {
          toast({ title: "Plano criado" });
          setDialogNovoAberto(false);
          queryClient.invalidateQueries({ queryKey: getListPlanosMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao criar plano", variant: "destructive" }),
      },
    );
  }

  function salvarEdicao(id: number, form: PlanoFormState) {
    atualizar.mutate(
      { id, data: montarPayload(form) as any },
      {
        onSuccess: () => {
          toast({ title: "Plano atualizado" });
          setPlanoEditando(null);
          queryClient.invalidateQueries({ queryKey: getListPlanosMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao salvar o plano", variant: "destructive" }),
      },
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const planoEmEdicao = planos?.find((p) => p.id === planoEditando);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Planos</CardTitle>
          <CardDescription>Preço, limites e recursos de cada plano da plataforma.</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogNovoAberto(true)}>
          <Plus className="w-4 h-4" /> Novo plano
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plano</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead className="text-center">Máx. Professores</TableHead>
              <TableHead className="text-center">Máx. Turmas</TableHead>
              <TableHead className="text-center">IA</TableHead>
              <TableHead className="text-center">Export</TableHead>
              <TableHead className="text-center">Import</TableHead>
              <TableHead className="text-center">Ativo</TableHead>
              <TableHead className="text-center">Editar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {planos?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell className="text-xs">{formatPreco(p.precoMensal, p.precoAnual)}</TableCell>
                <TableCell className="text-center">{p.maxProfessores}</TableCell>
                <TableCell className="text-center">{p.maxTurmas}</TableCell>
                <TableCell className="text-center">{p.temIA ? "✓" : "—"}</TableCell>
                <TableCell className="text-center">{p.temExport ? "✓" : "—"}</TableCell>
                <TableCell className="text-center">{p.temImport ? "✓" : "—"}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={p.ativo} onCheckedChange={(v) => alternarAtivo(p.id, v, p.nome)} />
                </TableCell>
                <TableCell className="text-center">
                  <Button size="icon" variant="ghost" onClick={() => setPlanoEditando(p.id)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <PlanoFormDialog
        aberto={dialogNovoAberto}
        onOpenChange={setDialogNovoAberto}
        titulo="Novo plano"
        valorInicial={FORM_VAZIO}
        salvando={criar.isPending}
        aoSalvar={criarPlano}
      />

      {planoEmEdicao && (
        <PlanoFormDialog
          aberto={planoEditando !== null}
          onOpenChange={(v) => !v && setPlanoEditando(null)}
          titulo={`Editar ${planoEmEdicao.nome}`}
          salvando={atualizar.isPending}
          aoSalvar={(form) => salvarEdicao(planoEmEdicao.id, form)}
          valorInicial={{
            nome: planoEmEdicao.nome,
            precoMensalReais: (planoEmEdicao.precoMensal / 100).toString(),
            precoAnualReais: planoEmEdicao.precoAnual ? (planoEmEdicao.precoAnual / 100).toString() : "",
            maxProfessores: planoEmEdicao.maxProfessores,
            maxTurmas: planoEmEdicao.maxTurmas,
            temIA: planoEmEdicao.temIA,
            temExport: planoEmEdicao.temExport,
            temImport: planoEmEdicao.temImport,
            ativo: planoEmEdicao.ativo,
          }}
        />
      )}
    </Card>
  );
}
