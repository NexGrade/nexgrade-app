import { useState } from "react";
import {
  useListHorariosExperimentais,
  useDeleteHorarioExperimental,
  usePromoverHorarioExperimental,
  useGerarHorario,
  useListTurmas,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Plus, Trash2, CheckCircle, ArrowUpCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function HorariosExperimentais() {
  const { data: expSlots = [], isLoading } = useListHorariosExperimentais({});
  const { data: turmas = [] } = useListTurmas();
  const { mutateAsync: deleteExp } = useDeleteHorarioExperimental();
  const { mutateAsync: promover } = usePromoverHorarioExperimental();
  const { mutateAsync: gerar } = useGerarHorario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [openGerar, setOpenGerar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [gerarForm, setGerarForm] = useState({
    turmaId: "",
    nomeExperimental: `Experimento-${new Date().toISOString().split("T")[0]}`,
    aulaspordia: 5,
    substituir: true,
    reduzirJanelas: true,
    fatorPedagogico: false,
    compactarCargaHoraria: false,
  });

  const nomes = [...new Set(expSlots.map(s => s.nome))];

  const handleGerar = async () => {
    if (!gerarForm.turmaId) { toast({ title: "Selecione uma turma", variant: "destructive" }); return; }
    if (!gerarForm.nomeExperimental.trim()) { toast({ title: "Informe o nome do experimento", variant: "destructive" }); return; }
    setGerando(true);
    try {
      const result = await gerar({
        data: {
          turmaId: Number(gerarForm.turmaId),
          nomeExperimental: gerarForm.nomeExperimental,
          aulaspordia: gerarForm.aulaspordia,
          substituir: gerarForm.substituir,
          reduzirJanelas: gerarForm.reduzirJanelas,
          fatorPedagogico: gerarForm.fatorPedagogico,
          compactarCargaHoraria: gerarForm.compactarCargaHoraria,
          experimental: true,
        }
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      toast({ title: `Experimento gerado! ${result.slotsGerados} aulas criadas.${result.conflitos.length ? ` ${result.conflitos.length} aviso(s).` : ""}` });
      setOpenGerar(false);
    } catch (e) {
      toast({ title: "Erro ao gerar experimento", variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  const handlePromover = async (nome: string) => {
    if (!confirm(`Promover "${nome}" para horário oficial? Isso substituirá o horário atual das turmas envolvidas.`)) return;
    try {
      await promover({ nome });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/horarios"] });
      toast({ title: `"${nome}" promovido para horário oficial!` });
    } catch {
      toast({ title: "Erro ao promover", variant: "destructive" });
    }
  };

  const handleDelete = async (nome: string) => {
    if (!confirm(`Remover o experimento "${nome}"?`)) return;
    await deleteExp({ nome });
    await queryClient.invalidateQueries({ queryKey: ["/api/horarios/experimentais"] });
    toast({ title: `Experimento "${nome}" removido` });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="w-7 h-7 text-purple-500" />
            Modo Experimental
          </h1>
          <p className="text-muted-foreground mt-1">
            Gere e teste horários alternativos sem afetar a grade oficial.
          </p>
        </div>
        <Button onClick={() => setOpenGerar(true)}>
          <Plus className="w-4 h-4 mr-2" />Novo Experimento
        </Button>
      </div>

      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
        <p className="font-medium mb-1">Como funciona o Modo Experimental?</p>
        <p>Gere versões alternativas de horário sem substituir a grade oficial. Compare, ajuste e quando estiver satisfeito, clique em <strong>Promover para oficial</strong> para aplicar.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : nomes.length === 0 ? (
        <Card className="border-dashed border-purple-200">
          <CardContent className="py-16 text-center">
            <FlaskConical className="w-10 h-10 mx-auto text-purple-300 mb-3" />
            <p className="text-muted-foreground">Nenhum experimento criado ainda.</p>
            <Button className="mt-4" variant="outline" onClick={() => setOpenGerar(true)}>
              Criar primeiro experimento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {nomes.map(nome => {
            const slots = expSlots.filter(s => s.nome === nome);
            const turmasNome = [...new Set(slots.map(s => turmas.find(t => t.id === s.turmaId)?.nome ?? `Turma #${s.turmaId}`))];
            return (
              <Card key={nome} className="border-purple-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-purple-500" />
                        {nome}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {slots.length} aulas · Turmas: {turmasNome.join(", ")}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5" onClick={() => handlePromover(nome)}>
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        Promover para oficial
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(nome)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 5 }).map((_, dia) => {
                      const aulasNoDia = slots.filter(s => s.diaSemana === dia).sort((a, b) => a.numeroAula - b.numeroAula);
                      if (aulasNoDia.length === 0) return null;
                      return (
                        <div key={dia} className="text-xs bg-purple-50 border border-purple-100 rounded px-2 py-1">
                          <span className="font-medium text-purple-700">{["Seg","Ter","Qua","Qui","Sex"][dia]}</span>
                          <span className="text-muted-foreground ml-1">{aulasNoDia.length} aula{aulasNoDia.length > 1 ? "s" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={openGerar} onOpenChange={setOpenGerar}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Experimento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do experimento *</Label>
              <Input value={gerarForm.nomeExperimental} onChange={e => setGerarForm(f => ({ ...f, nomeExperimental: e.target.value }))} placeholder="Ex: Grade-Alternativa-2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Turma *</Label>
              <Select value={gerarForm.turmaId} onValueChange={v => setGerarForm(f => ({ ...f, turmaId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{turmas.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Aulas por dia</Label>
              <Select value={String(gerarForm.aulaspordia)} onValueChange={v => setGerarForm(f => ({ ...f, aulaspordia: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n} aulas/dia</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Reduzir janelas do professor</Label>
              <Switch checked={gerarForm.reduzirJanelas} onCheckedChange={v => setGerarForm(f => ({ ...f, reduzirJanelas: v }))} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Fator pedagógico (distribuição equilibrada)</Label>
              <Switch checked={gerarForm.fatorPedagogico} onCheckedChange={v => setGerarForm(f => ({ ...f, fatorPedagogico: v }))} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="cursor-pointer">Compactar carga horária</Label>
              <Switch checked={gerarForm.compactarCargaHoraria} onCheckedChange={v => setGerarForm(f => ({ ...f, compactarCargaHoraria: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerar(false)}>Cancelar</Button>
            <Button onClick={handleGerar} disabled={gerando}>{gerando ? "Gerando..." : "Gerar Experimento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
