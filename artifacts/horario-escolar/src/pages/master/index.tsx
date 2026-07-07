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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Users, GraduationCap, CalendarDays, Sparkles, ShieldCheck, Plus,
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

function formatPreco(centavos: number) {
  return centavos === 0 ? "Gratuito" : `R$ ${(centavos / 100).toFixed(0)}/mês`;
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
                      <option key={p.id} value={p.id}>{p.nome} ({formatPreco(p.preco)})</option>
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
              </TableRow>
            ))}
            {escolas?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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

function PlanosTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: planos, isLoading } = useListPlanosMaster({ query: { queryKey: getListPlanosMasterQueryKey() } });
  const atualizar = useUpdatePlano();
  const [novo, setNovo] = useState({ nome: "", preco: 0, maxProfessores: 10, maxTurmas: 5 });
  const [dialogAberto, setDialogAberto] = useState(false);
  const criar = useCreatePlano();

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

  function criarPlano() {
    if (!novo.nome.trim()) return;
    criar.mutate(
      { data: novo },
      {
        onSuccess: () => {
          toast({ title: "Plano criado" });
          setDialogAberto(false);
          setNovo({ nome: "", preco: 0, maxProfessores: 10, maxTurmas: 5 });
          queryClient.invalidateQueries({ queryKey: getListPlanosMasterQueryKey() });
        },
        onError: () => toast({ title: "Erro ao criar plano", variant: "destructive" }),
      },
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Planos</CardTitle>
          <CardDescription>Preço, limites e recursos de cada plano da plataforma.</CardDescription>
        </div>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Novo plano</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo plano</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome do plano" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              <Input type="number" placeholder="Preço mensal em centavos (0 = gratuito)" value={novo.preco}
                onChange={(e) => setNovo({ ...novo, preco: Number(e.target.value) })} />
              <Input type="number" placeholder="Máximo de professores" value={novo.maxProfessores}
                onChange={(e) => setNovo({ ...novo, maxProfessores: Number(e.target.value) })} />
              <Input type="number" placeholder="Máximo de turmas" value={novo.maxTurmas}
                onChange={(e) => setNovo({ ...novo, maxTurmas: Number(e.target.value) })} />
            </div>
            <DialogFooter>
              <Button onClick={criarPlano} disabled={criar.isPending}>{criar.isPending ? "Criando..." : "Criar plano"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {planos?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{formatPreco(p.preco)}</TableCell>
                <TableCell className="text-center">{p.maxProfessores}</TableCell>
                <TableCell className="text-center">{p.maxTurmas}</TableCell>
                <TableCell className="text-center">{p.temIA ? "✓" : "—"}</TableCell>
                <TableCell className="text-center">{p.temExport ? "✓" : "—"}</TableCell>
                <TableCell className="text-center">{p.temImport ? "✓" : "—"}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={p.ativo} onCheckedChange={(v) => alternarAtivo(p.id, v, p.nome)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
