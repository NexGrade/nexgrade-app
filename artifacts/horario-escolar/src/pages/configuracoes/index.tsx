import { useState } from "react";
import { useListConfiguracoes, useUpsertConfiguracao } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save } from "lucide-react";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const CONFIG_DEFAULTS = {
  "escola.nome": "Nome da Escola",
  "escola.estado": "SP",
  "escola.modalidade": "regular",
  "horario.aulaspordia": "5",
  "horario.reduzirjanelas": "true",
  "horario.fatorpedagogico": "false",
  "seed.estado": "SP",
  "seed.versao": "2025",
};

export default function ConfiguracoesList() {
  const { data: configs = [], isLoading } = useListConfiguracoes();
  const { mutateAsync: upsert } = useUpsertConfiguracao();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const getVal = (chave: string): string => {
    const override = form[chave];
    if (override !== undefined) return override;
    const saved = configs.find(c => c.chave === chave);
    if (saved?.valor !== undefined && saved.valor !== null) return String(saved.valor);
    return CONFIG_DEFAULTS[chave as keyof typeof CONFIG_DEFAULTS] ?? "";
  };

  const set = (chave: string, valor: string) => setForm(f => ({ ...f, [chave]: valor }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries({ ...CONFIG_DEFAULTS, ...form });
      for (const [chave, valor] of entries) {
        await upsert({ chave, data: { valor: getVal(chave) } });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/configuracoes"] });
      setForm({});
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground mt-1">Ajustes do sistema, escola e relatórios SEED.</p>
        </div>
        <Button onClick={handleSave} disabled={saving || isLoading}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar todas"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" /> Dados da Escola</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da Escola</Label>
              <Input value={getVal("escola.nome")} onChange={e => set("escola.nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={getVal("escola.estado")} onValueChange={v => set("escola.estado", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS_BR.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select value={getVal("escola.modalidade")} onValueChange={v => set("escola.modalidade", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Ensino Regular</SelectItem>
                  <SelectItem value="integral">Tempo Integral</SelectItem>
                  <SelectItem value="hibrido">Ensino Híbrido</SelectItem>
                  <SelectItem value="eja">EJA</SelectItem>
                  <SelectItem value="nem">Novo Ensino Médio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" /> Geração de Horário</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Aulas por dia (padrão)</Label>
              <Select value={getVal("horario.aulaspordia")} onValueChange={v => set("horario.aulaspordia", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[4, 5, 6, 7, 8].map(n => <SelectItem key={n} value={String(n)}>{n} aulas/dia</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reduzir janelas automaticamente</Label>
              <Select value={getVal("horario.reduzirjanelas")} onValueChange={v => set("horario.reduzirjanelas", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Sim (recomendado)</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fator pedagógico (distribuição equilibrada)</Label>
              <Select value={getVal("horario.fatorpedagogico")} onValueChange={v => set("horario.fatorpedagogico", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativado</SelectItem>
                  <SelectItem value="false">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" /> Relatórios SEED</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Estado do relatório SEED</Label>
              <Select value={getVal("seed.estado")} onValueChange={v => set("seed.estado", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS_BR.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Versão do formato SEED</Label>
              <Select value={getVal("seed.versao")} onValueChange={v => set("seed.versao", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
