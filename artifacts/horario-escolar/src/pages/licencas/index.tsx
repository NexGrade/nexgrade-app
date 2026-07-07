import { useState } from "react";
import { useListLicencas, useCreateLicenca, useUpdateLicenca, useDeleteLicenca, useListProfessores } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Trash2, CheckCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const TIPOS_LICENCA = [
  { value: "medica", label: "Médica" },
  { value: "maternidade", label: "Maternidade" },
  { value: "paternidade", label: "Paternidade" },
  { value: "capacitacao", label: "Capacitação" },
  { value: "outros", label: "Outros" },
];

type LicencaForm = { professorId: number; professorSubstitutoId?: number; dataInicio: string; dataFim: string; tipo: string; motivo: string; aprovada: boolean };
const emptyForm: LicencaForm = { professorId: 0, dataInicio: "", dataFim: "", tipo: "medica", motivo: "", aprovada: false };

function isAtiva(l: { dataInicio: string; dataFim: string }) {
  const hoje = new Date().toISOString().split("T")[0]!;
  return l.dataInicio <= hoje && l.dataFim >= hoje;
}

export default function LicencasList() {
  const { data: licencas = [], isLoading } = useListLicencas({});
  const { data: professores = [] } = useListProfessores();
  const { mutateAsync: createLicenca } = useCreateLicenca();
  const { mutateAsync: updateLicenca } = useUpdateLicenca();
  const { mutateAsync: deleteLicenca } = useDeleteLicenca();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LicencaForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filtroAtivas, setFiltroAtivas] = useState(false);

  const displayed = filtroAtivas ? licencas.filter(isAtiva) : licencas;

  const handleSave = async () => {
    if (!form.professorId || !form.dataInicio || !form.dataFim) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createLicenca({ data: { ...form, professorId: Number(form.professorId), tipo: form.tipo as "medica" | "maternidade" | "paternidade" | "capacitacao" | "outros" } });
      toast({ title: "Licença registrada! Comunicado automático criado." });
      await queryClient.invalidateQueries({ queryKey: ["/api/licencas"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/comunicados"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erro ao registrar licença", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAprovar = async (id: number, aprovada: boolean) => {
    await updateLicenca({ id, data: { aprovada } });
    await queryClient.invalidateQueries({ queryKey: ["/api/licencas"] });
    toast({ title: aprovada ? "Licença aprovada" : "Aprovação cancelada" });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover esta licença?")) return;
    await deleteLicenca({ id });
    await queryClient.invalidateQueries({ queryKey: ["/api/licencas"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    toast({ title: "Licença removida" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Licenças de Professores</h1>
          <p className="text-muted-foreground mt-1">Registre ausências e defina professores substitutos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filtroAtivas ? "default" : "outline"} size="sm" onClick={() => setFiltroAtivas(!filtroAtivas)}>
            {filtroAtivas ? "Todas" : "Apenas ativas"}
          </Button>
          <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />Nova Licença
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : displayed.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma licença {filtroAtivas ? "ativa " : ""}registrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map((l) => {
            const ativa = isAtiva(l);
            const prof = professores.find(p => p.id === l.professorId);
            const sub = l.professorSubstitutoId ? professores.find(p => p.id === l.professorSubstitutoId) : null;
            return (
              <Card key={l.id} className={`border-border/50 ${ativa ? "border-amber-200 bg-amber-50/30" : ""}`}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="flex items-center gap-2">
                    {ativa ? <Clock className="w-4 h-4 text-amber-500" /> : <CheckCircle className="w-4 h-4 text-muted-foreground" />}
                    <CardTitle className="text-base">{prof?.nome ?? `Professor #${l.professorId}`}</CardTitle>
                    {ativa && <Badge className="bg-amber-100 text-amber-700 border-0">Ativa</Badge>}
                    {l.aprovada && <Badge className="bg-green-100 text-green-700 border-0">Aprovada</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleAprovar(l.id, !l.aprovada)}>
                      {l.aprovada ? "Cancelar aprovação" : "Aprovar"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">{TIPOS_LICENCA.find(t => t.value === l.tipo)?.label ?? l.tipo}</span>
                    {" · "}{l.dataInicio} até {l.dataFim}
                  </p>
                  {sub && <p className="text-muted-foreground">Substituto: <span className="font-medium text-foreground">{sub.nome}</span></p>}
                  {l.motivo && <p className="text-muted-foreground italic">{l.motivo}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Licença</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Professor *</Label>
              <Select value={String(form.professorId)} onValueChange={v => setForm(f => ({ ...f, professorId: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{professores.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data início *</Label>
                <Input type="date" value={form.dataInicio} onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data fim *</Label>
                <Input type="date" value={form.dataFim} onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_LICENCA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Professor Substituto</Label>
              <Select value={String(form.professorSubstitutoId ?? "")} onValueChange={v => setForm(f => ({ ...f, professorSubstitutoId: v ? Number(v) : undefined }))}>
                <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {professores.filter(p => p.id !== form.professorId).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input placeholder="Opcional..." value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Registrar Licença"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
