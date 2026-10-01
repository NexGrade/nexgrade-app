// [USUARIOS-CARGOS] (2026-10-01) Usuarios da escola direto do Clerk, com cargo.
// Direcao/Coordenacao = acesso total | Gestor de reservas = so Reservas |
// Professor = so a Minha Agenda. (Versao anterior: index.tsx.bak_20261001_usuarios_cargos)
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Shield, Mail, Search, Trash2, X, Loader2 } from "lucide-react";

type Cargo = "direcao" | "coordenacao" | "reservas" | "professor";
type Acesso = {
  tipo: "membro" | "convite";
  id: string;
  nome: string;
  email: string;
  cargo: Cargo;
  rotuloCargo: string;
  papel: string;
  ehVoce: boolean;
};

const CARGOS: Array<{ valor: Cargo; rotulo: string; descricao: string }> = [
  { valor: "direcao", rotulo: "Direção", descricao: "Acesso total ao sistema" },
  { valor: "coordenacao", rotulo: "Coordenação", descricao: "Acesso total ao sistema" },
  { valor: "reservas", rotulo: "Gestor de reservas", descricao: "Só a agenda de reservas (sem regras por professor e sem a grade)" },
  { valor: "professor", rotulo: "Professor", descricao: "Só a Minha Agenda" },
];
const COR_CARGO: Record<Cargo, string> = {
  direcao: "bg-blue-100 text-blue-800 border-blue-200",
  coordenacao: "bg-blue-100 text-blue-800 border-blue-200",
  reservas: "bg-violet-100 text-violet-800 border-violet-200",
  professor: "bg-slate-100 text-slate-700 border-slate-200",
};
const URL_BASE = "/api/usuarios-acessos";
const CHAVE = ["usuarios-acessos"];

function mensagemErro(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string };
  return e?.data?.error ?? e?.message ?? "Tente novamente.";
}

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<{ nome: string; email: string; cargo: Cargo }>({ nome: "", email: "", cargo: "reservas" });

  const { data: acessos, isLoading, isError, error } = useQuery({
    queryKey: CHAVE,
    queryFn: () => customFetch<Acesso[]>(URL_BASE, { responseType: "json" }),
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const l = acessos ?? [];
    return t ? l.filter((a) => a.nome.toLowerCase().includes(t) || a.email.toLowerCase().includes(t)) : l;
  }, [acessos, busca]);

  const aoTerminar = (titulo: string) => ({
    onSuccess: (data: unknown) => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      toast({ title: titulo, description: (data as { mensagem?: string })?.mensagem });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível concluir", description: mensagemErro(err), variant: "destructive" }),
  });

  const enviar = (url: string, method: string, body?: unknown) =>
    customFetch<{ ok: boolean; mensagem?: string }>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      responseType: "json",
    });

  const convidar = useMutation({
    mutationFn: () => enviar(URL_BASE + "/convites", "POST", form),
    ...aoTerminar("Convite enviado"),
  });
  const trocarCargo = useMutation({
    mutationFn: (v: { userId: string; cargo: Cargo }) => enviar(URL_BASE + "/membros/" + encodeURIComponent(v.userId), "PATCH", { cargo: v.cargo }),
    ...aoTerminar("Cargo alterado"),
  });
  const remover = useMutation({
    mutationFn: (a: Acesso) =>
      enviar(URL_BASE + (a.tipo === "membro" ? "/membros/" : "/convites/") + encodeURIComponent(a.id), "DELETE"),
    ...aoTerminar("Pronto"),
  });

  const abrirNovo = () => { setForm({ nome: "", email: "", cargo: "reservas" }); setAberto(true); };
  const salvarNovo = () => convidar.mutate(undefined, { onSuccess: () => setAberto(false) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground">Quem tem acesso ao sistema nesta escola, e com qual cargo.</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" /> Novo Usuário</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome ou e-mail..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : isError ? (
        <Card><CardContent className="py-10 text-center text-sm text-destructive">{mensagemErro(error)}</CardContent></Card>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/50" />
            <p className="font-semibold">{busca ? "Ninguém encontrado" : "Nenhum usuário com acesso"}</p>
            <p className="text-sm text-muted-foreground">Use "Novo Usuário" para convidar alguém por e-mail.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((a) => (
            <Card key={a.tipo + a.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.nome}</span>
                    {a.ehVoce && <Badge variant="outline">Você</Badge>}
                    <Badge variant="outline" className={COR_CARGO[a.cargo]}>{a.rotuloCargo}</Badge>
                    {a.tipo === "convite" && <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Convite pendente</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{a.email}</span>
                  </div>
                </div>
                {a.tipo === "membro" && !a.ehVoce && (
                  <Select
                    value={a.cargo}
                    onValueChange={(v) => {
                      if (v !== a.cargo && window.confirm("Mudar o cargo de " + a.nome + " para " + (CARGOS.find((c) => c.valor === v)?.rotulo ?? v) + "?")) {
                        trocarCargo.mutate({ userId: a.id, cargo: v as Cargo });
                      }
                    }}
                    disabled={trocarCargo.isPending}
                  >
                    <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{CARGOS.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {!a.ehVoce && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={a.tipo === "membro" ? "Remover acesso" : "Cancelar convite"}
                    disabled={remover.isPending}
                    onClick={() => {
                      const pergunta = a.tipo === "membro" ? "Remover o acesso de " + a.nome + " a esta escola?" : "Cancelar o convite de " + a.email + "?";
                      if (window.confirm(pergunta)) remover.mutate(a);
                    }}
                  >
                    {a.tipo === "membro" ? <Trash2 className="h-4 w-4 text-destructive" /> : <X className="h-4 w-4" />}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>A pessoa recebe um convite por e-mail e entra já com o cargo escolhido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nu-nome">Nome</Label>
              <Input id="nu-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nu-email">E-mail</Label>
              <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@escola.pr.gov.br" />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Select value={form.cargo} onValueChange={(v) => setForm({ ...form, cargo: v as Cargo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CARGOS.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{CARGOS.find((c) => c.valor === form.cargo)?.descricao}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={convidar.isPending || form.nome.trim().length < 2 || !form.email.includes("@")}>
              {convidar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
