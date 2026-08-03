import { useState, useEffect } from "react";
import { useCadastrarEscola, useGetEscolaAtual, getGetEscolaAtualQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Landmark, Save, IdCard } from "lucide-react";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const MODALIDADES = [
  { value: "regular", label: "Ensino Regular" },
  { value: "tecnica", label: "Técnica" },
  { value: "eja", label: "EJA" },
  { value: "normal_magisterio", label: "Normal/Magistério" },
];

const TURNOS = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "noturno", label: "Noturno" },
  { value: "integral", label: "Integral" },
];

// [FIX] Antes esta página usava um sistema de configuração genérico
// (chave/valor), desconectado da escola de verdade -- não tinha CNPJ
// nem Cidade (só existiam no cadastro inicial, sem jeito de editar
// depois), e o "Nome"/"Estado"/"Modalidade" salvos aqui não eram os
// mesmos usados pela integração de cobrança (Asaas lê da tabela
// escolas, não de configuracoes). Reescrita pra editar o registro
// real da escola -- mesma rota que o onboarding usa -- com todos os
// campos de identificação oficial (Código INEP, NRE, turnos,
// resolução SEED-PR), não só o essencial.
export default function DadosEscolaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: escolaAtual, isLoading } = useGetEscolaAtual({ query: { queryKey: getGetEscolaAtualQueryKey() } });
  const cadastrarEscola = useCadastrarEscola();

  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("PR");
  const [modalidade, setModalidade] = useState("regular");
  const [codigoInep, setCodigoInep] = useState("");
  const [nre, setNre] = useState("");
  const [turnos, setTurnos] = useState<string[]>([]);
  const [resolucaoSeedPr, setResolucaoSeedPr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (escolaAtual) {
      setNomeFantasia(escolaAtual.nomeFantasia ?? "");
      setCnpj((escolaAtual as any).cnpj ?? "");
      setCidade(escolaAtual.cidade ?? "");
      setEstado(escolaAtual.estado ?? "PR");
      setModalidade(escolaAtual.modalidade ?? "regular");
      setCodigoInep((escolaAtual as any).codigoInep ?? "");
      setNre((escolaAtual as any).nre ?? "");
      const turnosStr = (escolaAtual as any).turnosOfertados as string | null | undefined;
      setTurnos(turnosStr ? turnosStr.split(",").map((t) => t.trim()).filter(Boolean) : []);
      setResolucaoSeedPr((escolaAtual as any).resolucaoSeedPr ?? "");
    }
  }, [escolaAtual]);

  const toggleTurno = (valor: string, marcado: boolean) => {
    setTurnos((atual) => (marcado ? [...atual, valor] : atual.filter((t) => t !== valor)));
  };

  const handleSave = async () => {
    if (!nomeFantasia.trim()) {
      toast({ title: "Informe o nome da escola", variant: "destructive" });
      return;
    }
    if (cnpj.replace(/\D/g, "").length !== 14) {
      toast({ title: "Informe um CNPJ válido (14 dígitos)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // [NOTA] emailContato/telefoneContato não são enviados aqui de
      // propósito -- o backend preserva o valor existente quando eles
      // vêm undefined (ver routes/escolas.ts), então essa tela não
      // precisa conhecer nem arriscar sobrescrever o contato de
      // cobrança, que é gerenciado em Assinatura.
      await cadastrarEscola.mutateAsync({
        data: {
          nomeFantasia: nomeFantasia.trim(),
          cnpj: cnpj.trim(),
          cidade: cidade.trim() || undefined,
          estado,
          modalidade: modalidade as any,
          codigoInep: codigoInep.trim() || undefined,
          nre: nre.trim() || undefined,
          turnosOfertados: turnos.length > 0 ? turnos.join(",") : undefined,
          resolucaoSeedPr: resolucaoSeedPr.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetEscolaAtualQueryKey() });
      toast({ title: "Dados da escola salvos!" });
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
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
          <p className="text-muted-foreground mt-1">Identificação usada nos relatórios, na grade horária e na cobrança.</p>
        </div>
        <Button onClick={handleSave} disabled={saving || isLoading}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da Escola</Label>
              <Input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={estado} onValueChange={setEstado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ESTADOS_BR.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select value={modalidade} onValueChange={setModalidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODALIDADES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><IdCard className="w-4 h-4" /> Identificação Oficial (MEC/SEED)</CardTitle>
            <CardDescription>Usados em relatórios oficiais e para diferenciar escolas com nome parecido.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Código INEP</Label>
              <Input value={codigoInep} onChange={(e) => setCodigoInep(e.target.value)} placeholder="00000000" />
            </div>
            <div className="space-y-1.5">
              <Label>NRE (Núcleo Regional de Educação)</Label>
              <Input value={nre} onChange={(e) => setNre(e.target.value)} placeholder="Área Metropolitana Norte" />
            </div>
            <div className="space-y-1.5">
              <Label>Turnos ofertados</Label>
              <div className="flex flex-wrap gap-4 pt-1">
                {TURNOS.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={turnos.includes(t.value)}
                      onCheckedChange={(v) => toggleTurno(t.value, v === true)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Resolução SEED-PR (ou equivalente estadual)</Label>
              <Input value={resolucaoSeedPr} onChange={(e) => setResolucaoSeedPr(e.target.value)} placeholder="7.200/2025" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
