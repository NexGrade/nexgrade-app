import { useState } from "react";
import { useListComunicados, useCreateComunicado, useMarcarComunicadoLido, useDeleteComunicado, useListTurmas } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bell, Plus, Trash2, CheckCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const TIPOS = [
  { value: "geral", label: "Geral", color: "bg-[#1565C0]/10 text-[#1565C0]" },
  { value: "licenca", label: "Licença", color: "bg-amber-100 text-amber-700" },
  { value: "conflito", label: "Conflito", color: "bg-red-100 text-red-700" },
  { value: "horario", label: "Horário", color: "bg-green-100 text-green-700" },
  { value: "urgente", label: "Urgente", color: "bg-rose-100 text-rose-700" },
];

type Form = { titulo: string; mensagem: string; tipo: string; turmaId?: number; autorNome: string };
const emptyForm: Form = { titulo: "", mensagem: "", tipo: "geral", autorNome: "Coordenação" };

export default function ComunicadosList() {
  const { data: comunicados = [], isLoading } = useListComunicados({});
  const { data: turmas = [] } = useListTurmas();
  const { mutateAsync: createComunicado } = useCreateComunicado();
  const { mutateAsync: marcarLido } = useMarcarComunicadoLido();
  const { mutateAsync: deleteComunicado } = useDeleteComunicado();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filtroNaoLidos, setFiltroNaoLidos] = useState(false);

  const displayed = filtroNaoLidos ? comunicados.filter(c => !c.lida) : comunicados;

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.mensagem.trim()) {
      toast({ title: "Título e mensagem são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createComunicado({ data: { ...form, tipo: form.tipo as "geral" | "licenca" | "conflito" | "horario" | "urgente" } });
      toast({ title: "Comunicado enviado!" });
      await queryClient.invalidateQueries({ queryKey: ["/api/comunicados"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erro ao enviar comunicado", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLido = async (id: number) => {
    await marcarComunicadoLido({ id });
    await queryClient.invalidateQueries({ queryKey: ["/api/comunicados"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
  };

  // silence unused var warning
  const marcarComunicadoLido = marcarLido;

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este comunicado?")) return;
    await deleteComunicado({ id });
    await queryClient.invalidateQueries({ queryKey: ["/api/comunicados"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    toast({ title: "Comunicado removido" });
  };

  const naoLidos = comunicados.filter(c => !c.lida).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            Comunicados
            {naoLidos > 0 && <Badge className="bg-pink-100 text-pink-700 border-0">{naoLidos} não lido{naoLidos > 1 ? "s" : ""}</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1">Avisos e notificações para turmas e professores.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filtroNaoLidos ? "default" : "outline"} size="sm" onClick={() => setFiltroNaoLidos(!filtroNaoLidos)}>
            {filtroNaoLidos ? "Todos" : "Não lidos"}
          </Button>
          <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />Novo Comunicado
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : displayed.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Bell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum comunicado {filtroNaoLidos ? "não lido" : ""} encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map((c) => {
            const tipo = TIPOS.find(t => t.value === c.tipo);
            const turma = turmas.find(t => t.id === c.turmaId);
            return (
              <Card key={c.id} className={`border-border/50 transition-opacity ${c.lida ? "opacity-60" : ""}`}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipo?.color ?? "bg-gray-100 text-gray-700"}`}>
                        {tipo?.label ?? c.tipo}
                      </span>
                      {!c.lida && <span className="w-2 h-2 rounded-full bg-pink-500" />}
                      {turma && <span className="text-xs text-muted-foreground">· {turma.nome}</span>}
                    </div>
                    <CardTitle className="text-base">{c.titulo}</CardTitle>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!c.lida && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Marcar como lido" onClick={() => handleLido(c.id)}>
                        <CheckCheck className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{c.mensagem}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {c.autorNome} · {new Date(c.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Comunicado</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input placeholder="Ex: Reunião de pais e mestres" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Turma (opcional)</Label>
              <Select value={String(form.turmaId ?? "")} onValueChange={v => setForm(f => ({ ...f, turmaId: v ? Number(v) : undefined }))}>
                <SelectTrigger><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as turmas</SelectItem>
                  {turmas.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem *</Label>
              <Textarea placeholder="Conteúdo do comunicado..." value={form.mensagem} onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Autor</Label>
              <Input value={form.autorNome} onChange={e => setForm(f => ({ ...f, autorNome: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Enviando..." : "Enviar Comunicado"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
