import { useState } from "react";
import { useListConfiguracoes, useUpsertConfiguracao } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Landmark, Save } from "lucide-react";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const CONFIG_DEFAULTS = {
  "escola.nome": "Nome da Escola",
  "escola.estado": "SP",
  "escola.modalidade": "regular",
};

// [NOVO] Extraída de pages/configuracoes/index.tsx pra ter menu
// próprio -- antes competia visualmente com ajustes de sistema
// (geração de horário, SEED) que não tem nada a ver com identidade da
// escola.
export default function DadosEscolaPage() {
  const { data: configs = [], isLoading } = useListConfiguracoes();
  const { mutateAsync: upsert } = useUpsertConfiguracao();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const getVal = (chave: string): string => {
    const override = form[chave];
    if (override !== undefined) return override;
    const saved = configs.find((c) => c.chave === chave);
    if (saved?.valor !== undefined && saved.valor !== null) return String(saved.valor);
    return CONFIG_DEFAULTS[chave as keyof typeof CONFIG_DEFAULTS] ?? "";
  };

  const set = (chave: string, valor: string) => setForm((f) => ({ ...f, [chave]: valor }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries({ ...CONFIG_DEFAULTS, ...form });
      for (const [chave, valor] of entries) {
        await upsert({ chave, data: { valor: getVal(chave) } });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/configuracoes"] });
      setForm({});
      toast({ title: "Dados da escola salvos!" });
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
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="w-7 h-7 text-[#1565C0]" /> Dados da Escola
          </h1>
          <p className="text-muted-foreground mt-1">Identificação usada nos relatórios e na grade horária.</p>
        </div>
        <Button onClick={handleSave} disabled={saving || isLoading}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card className="max-w-xl">
        <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da Escola</Label>
            <Input value={getVal("escola.nome")} onChange={(e) => set("escola.nome", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={getVal("escola.estado")} onValueChange={(v) => set("escola.estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADOS_BR.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modalidade</Label>
            <Select value={getVal("escola.modalidade")} onValueChange={(v) => set("escola.modalidade", v)}>
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
    </div>
  );
}
