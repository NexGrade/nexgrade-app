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
} from "@workspace/api-client-react";
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
        <p className="text-muted-foreground">Administração da plataforma NexGrade — todas as escolas.</p>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const cards = [
    { label: "Escolas", value: data.totalEscolas, sub: `${data.escolasAtivas} ativas · ${data.escolasInativas} inativas`, icon: Building2 },
    { label: "Em período de avaliação", value: data.escolasEmTrial, sub: "escolas em trial", icon: CalendarDays },
    { label: "Professores cadastrados", value: data.totalProfessores, sub: `em ${data.totalTurmas} turmas`, icon: Users },
    { label: "Aulas na grade", value: data.totalAulasDistribuidas, sub: "distribuídas via Solver", icon: GraduationCap },
    { label: "Usuários da plataforma", value: data.totalUsuarios, sub: "contas ativas", icon: Users },
    { label: "Mensagens ao Assistente de IA", value: data.mensagensEnviadasParaIA, sub: "desde o início", icon: Sparkles },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Escola</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead className="text-center">Professores</TableHead>
              <TableHead className="text-center">Turmas</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Assinatura</TableHead>
              <TableHead className="text-center">Isenta</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {escolas?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.nomeFantasia}</TableCell>
                <TableCell className="text-muted-foreground">{e.cidade ?? "—"}/{e.estado}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className="text-xs">
                      <div>{(e as any).emailContato ?? <span className="text-muted-foreground">sem e-mail</span>}</div>
                      <div className="text-muted-foreground">{(e as any).telefoneContato ?? "sem telefone"}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEscolaEditandoContato(e.id)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <select
                    className="text-sm border rounded-md px-2 py-1 bg-background"
                    value={e.planoId ?? ""}
                    onChange={(ev) => mudarPlano(e.id, ev.target.value)}
                  >
                    <option value="">Sem plano</option>
                    {planos?.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome} ({formatPreco(p.precoMensal, p.precoAnual)})</option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-center">{e.totalProfessores}</TableCell>
                <TableCell className="text-center">{e.totalTurmas}</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Switch checked={e.planoAtivo} onCheckedChange={(v) => alternarAtiva(e.id, v)} />
                    <Badge variant={e.planoAtivo ? "default" : "secondary"}>
                      {e.planoAtivo ? "Ativa" : "Suspensa"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={(e as any).isenta ?? false} onCheckedChange={(v) => alternarIsenta(e.id, v)} />
                </TableCell>
                <TableCell className="text-center">
                  {(() => {
                    const badge = badgeAssinatura((e as any).asaasStatusAssinatura);
                    return (
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge className={"className" in badge ? badge.className : undefined} variant={"variant" in badge ? badge.variant : undefined}>
                          {badge.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Vence {formatVencimento((e as any).asaasProximoVencimento)}
                        </span>
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-center">
                  {(e as any).asaasSubscriptionId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive gap-1"
                      disabled={cancelarAssinatura.isPending}
                      onClick={() => cancelarAssinaturaDaEscola(e.id, e.nomeFantasia)}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancelar
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {escolas?.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Nenhuma escola cadastrada na plataforma ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {escolaEditandoContato && (
        <ContatoDialog
          escola={escolas!.find((e) => e.id === escolaEditandoContato)!}
          salvando={atualizar.isPending}
          onOpenChange={(v) => !v && setEscolaEditandoContato(null)}
          onSalvar={salvarContato}
        />
      )}
    </Card>
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
