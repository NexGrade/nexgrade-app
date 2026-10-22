import { useState } from "react";
import { Link } from "wouter";
import { useListConfiguracoes, useUpsertConfiguracao } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Save, ArrowLeft } from "lucide-react";

// RNF-SEED-01: valores confirmados na Resolução SEED n.º 7.200/2025 —
// ver scripts/src/seed-config-seed-pr.ts para a fonte de cada um. Ficam
// configuráveis (não fixos no código) porque a proporção hora-aula /
// hora-atividade está sob disputa judicial ativa e pode mudar.
const SEED_PR_DEFAULTS = {
  "seed_pr.padrao_20h": { aulasRegencia: 15, horasAtividade: 9 },
  "seed_pr.padrao_40h": { aulasRegencia: 30, horasAtividade: 18 },
  "seed_pr.teto_aulas_turno": { noturno: 19, diurno: 24 },
  "seed_pr.hora_atividade_mesmo_turno_ate": 19,
  "seed_pr.max_aulas_geminadas_padrao": 2,
};

// [NOVO] Extraída de pages/configuracoes/index.tsx -- essa seção é
// jurídica/técnica, raramente precisa de edição (só se a proporção
// hora-aula/hora-atividade mudar por decisão judicial), e competia
// visualmente com os ajustes do dia a dia (contato de cobrança,
// geração de horário) na tela principal. Fica em rota própria,
// acessível por um link discreto.
export default function ConformidadeSeedPrPage() {
  const { data: configs = [], isLoading } = useListConfiguracoes();
  const { mutateAsync: upsert } = useUpsertConfiguracao();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [seedForm, setSeedForm] = useState<Record<string, unknown>>({});
  const [savingSeed, setSavingSeed] = useState(false);

  const getSeedVal = <T,>(chave: keyof typeof SEED_PR_DEFAULTS): T => {
    if (seedForm[chave] !== undefined) return seedForm[chave] as T;
    const saved = configs.find((c) => c.chave === chave);
    if (saved?.valor !== undefined && saved.valor !== null) return saved.valor as T;
    return SEED_PR_DEFAULTS[chave] as T;
  };

  const setSeedSubVal = (chave: keyof typeof SEED_PR_DEFAULTS, subchave: string | null, valor: number) => {
    setSeedForm((f) => {
      if (subchave === null) return { ...f, [chave]: valor };
      const atual = getSeedVal<Record<string, number>>(chave);
      return { ...f, [chave]: { ...atual, [subchave]: valor } };
    });
  };

  const handleSaveSeed = async () => {
    setSavingSeed(true);
    try {
      for (const chave of Object.keys(SEED_PR_DEFAULTS) as (keyof typeof SEED_PR_DEFAULTS)[]) {
        await upsert({ chave, data: { valor: getSeedVal(chave) } });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/configuracoes"] });
      setSeedForm({});
      toast({ title: "Parâmetros SEED-PR salvos!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingSeed(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar para Configurações
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-[#1565C0]" /> Conformidade SEED-PR
            </h1>
            <p className="text-muted-foreground mt-1">
              Valores confirmados na Resolução SEED n.º 7.200/2025 (Art. 11).
            </p>
          </div>
          <Button onClick={handleSaveSeed} disabled={savingSeed || isLoading}>
            <Save className="w-4 h-4 mr-2" />
            {savingSeed ? "Salvando..." : "Salvar conformidade"}
          </Button>
        </div>
      </div>

      <Card className="border-[#1565C0]/30">
        <CardContent className="space-y-6 pt-6">
          <p className="text-sm text-muted-foreground">
            Ficam editáveis aqui — não fixos no sistema — porque a proporção hora-aula/hora-atividade está sob
            disputa judicial ativa entre a SEED-PR e o sindicato dos professores e pode mudar.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Padrão 20h semanais</Label>
              <p className="text-xs text-muted-foreground">Art. 11, §1º, I</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Aulas de regência</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<{ aulasRegencia: number }>("seed_pr.padrao_20h").aulasRegencia}
                    onChange={(e) => setSeedSubVal("seed_pr.padrao_20h", "aulasRegencia", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horas-atividade</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<{ horasAtividade: number }>("seed_pr.padrao_20h").horasAtividade}
                    onChange={(e) => setSeedSubVal("seed_pr.padrao_20h", "horasAtividade", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Padrão 40h semanais</Label>
              <p className="text-xs text-muted-foreground">Art. 11, §1º, II</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Aulas de regência</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<{ aulasRegencia: number }>("seed_pr.padrao_40h").aulasRegencia}
                    onChange={(e) => setSeedSubVal("seed_pr.padrao_40h", "aulasRegencia", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horas-atividade</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<{ horasAtividade: number }>("seed_pr.padrao_40h").horasAtividade}
                    onChange={(e) => setSeedSubVal("seed_pr.padrao_40h", "horasAtividade", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Teto de aulas por turno (semanal)</Label>
              <p className="text-xs text-muted-foreground">Art. 11, §3º</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Turno da noite</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<{ noturno: number }>("seed_pr.teto_aulas_turno").noturno}
                    onChange={(e) => setSeedSubVal("seed_pr.teto_aulas_turno", "noturno", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Demais turnos</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<{ diurno: number }>("seed_pr.teto_aulas_turno").diurno}
                    onChange={(e) => setSeedSubVal("seed_pr.teto_aulas_turno", "diurno", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Outras regras</Label>
              <p className="text-xs text-muted-foreground">Art. 11, §4º e recomendação operacional</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">HA no mesmo turno até (nº aulas)</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<number>("seed_pr.hora_atividade_mesmo_turno_ate")}
                    onChange={(e) => setSeedSubVal("seed_pr.hora_atividade_mesmo_turno_ate", null, Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Máx. aulas geminadas/dia (padrão)</Label>
                  <Input
                    type="number" min={1}
                    value={getSeedVal<number>("seed_pr.max_aulas_geminadas_padrao")}
                    onChange={(e) => setSeedSubVal("seed_pr.max_aulas_geminadas_padrao", null, Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
