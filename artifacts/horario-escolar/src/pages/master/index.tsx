import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEscolasMaster, useUpdateEscolaMaster, getListEscolasMasterQueryKey,
  useListPlanosMaster, useCreatePlano, useUpdatePlano, getListPlanosMasterQueryKey,
  useGetMasterMetrics, getGetMasterMetricsQueryKey,
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
  Building2, Users, GraduationCap, CalendarDays, Sparkles, ShieldCheck, Plus, Pencil,
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

function EscolasTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: escolas, isLoading } = useListEscolasMaster({ query: { queryKey: getListEscolasMasterQueryKey() } });
  const { data: planos } = useListPlanosMaster({ query: { queryKey: getListPlanosMasterQueryKey() } });
  const atualizar = useUpdateEscolaMaster();

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
              <TableHead>Plano</TableHead>
              <TableHead className="text-center">Professores</TableHead>
              <TableHead className="text-center">Turmas</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Isenta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {escolas?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.nomeFantasia}</TableCell>
                <TableCell className="text-muted-foreground">{e.cidade ?? "—"}/{e.estado}</TableCell>
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
              </TableRow>
            ))}
            {escolas?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma escola cadastrada na plataforma ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
