import { useState } from "react";
import { useListSalas, useCreateSala, useUpdateSala, useDeleteSala } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const TIPOS = [
  { value: "sala_aula", label: "Sala de Aula" },
  { value: "laboratorio", label: "Laboratório" },
  { value: "informatica", label: "Informática" },
  { value: "quadra", label: "Quadra" },
  { value: "auditorio", label: "Auditório" },
  { value: "biblioteca", label: "Biblioteca" },
  { value: "sala_arte", label: "Sala de Arte" },
  { value: "outro", label: "Outro" },
];

const TIPO_COLORS: Record<string, string> = {
  sala_aula: "bg-[#1565C0]/10 text-[#1565C0]",
  laboratorio: "bg-green-100 text-green-700",
  informatica: "bg-purple-100 text-purple-700",
  quadra: "bg-orange-100 text-orange-700",
  auditorio: "bg-pink-100 text-pink-700",
  biblioteca: "bg-yellow-100 text-yellow-700",
  sala_arte: "bg-rose-100 text-rose-700",
  outro: "bg-gray-100 text-gray-700",
};

type SalaForm = { nome: string; tipo: string; capacidade: number; observacoes: string };
const emptyForm: SalaForm = { nome: "", tipo: "sala_aula", capacidade: 35, observacoes: "" };

export default function SalasList() {
  const { data: salas = [], isLoading } = useListSalas();
  const { mutateAsync: createSala } = useCreateSala();
  const { mutateAsync: updateSala } = useUpdateSala();
  const { mutateAsync: deleteSala } = useDeleteSala();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SalaForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s: typeof salas[0]) => {
    setEditId(s.id);
    setForm({ nome: s.nome, tipo: s.tipo, capacidade: s.capacidade, observacoes: s.observacoes ?? "" });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateSala({ id: editId, data: { ...form, tipo: form.tipo as "sala_aula" | "laboratorio" | "informatica" | "quadra" | "auditorio" | "biblioteca" | "sala_arte" | "outro" } });
        toast({ title: "Sala atualizada!" });
      } else {
        await createSala({ data: { ...form, tipo: form.tipo as "sala_aula" | "laboratorio" | "informatica" | "quadra" | "auditorio" | "biblioteca" | "sala_arte" | "outro" } });
        toast({ title: "Sala criada!" });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/salas"] });
      setOpen(false);
    } catch {
      toast({ title: "Erro ao salvar sala", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover esta sala?")) return;
    await deleteSala({ id });
    await queryClient.invalidateQueries({ queryKey: ["/api/salas"] });
    toast({ title: "Sala removida" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salas e Espaços</h1>
          <p className="text-muted-foreground mt-1">Gerencie as salas, laboratórios e espaços coletivos.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nova Sala</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : salas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma sala cadastrada. Clique em "Nova Sala" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {salas.map((sala) => (
            <Card key={sala.id} className={`border-border/50 ${!sala.ativa ? "opacity-50" : ""}`}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{sala.nome}</CardTitle>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${TIPO_COLORS[sala.tipo] ?? TIPO_COLORS.outro}`}>
                    {TIPOS.find(t => t.value === sala.tipo)?.label ?? sala.tipo}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(sala)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(sala.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Capacidade: <span className="font-semibold text-foreground">{sala.capacidade} alunos</span></p>
                {sala.observacoes && <p className="text-xs text-muted-foreground mt-1">{sala.observacoes}</p>}
                {!sala.ativa && <Badge variant="secondary" className="mt-2">Inativa</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Sala" : "Nova Sala"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Ex: Sala 01, Lab de Ciências..." value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Capacidade (alunos)</Label>
              <Input type="number" min={1} value={form.capacidade} onChange={e => setForm(f => ({ ...f, capacidade: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input placeholder="Opcional..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
