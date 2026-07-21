import { useState, useMemo } from "react";
import { useListCargaHoraria } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, CheckCircle2, AlertTriangle, Circle } from "lucide-react";

// [NOVO] Extraído de pages/calendario/index.tsx a pedido -- o
// Calendário Escolar deve mostrar só o cabeçalho (trimestres/dias
// letivos) e a grade do mês; a Carga Horária Cumprida × Exigida ganhou
// menu próprio, já que é uma informação de acompanhamento pedagógico
// diferente do calendário de datas, e a lista de disciplinas pode
// ficar longa em escolas com muitas turmas.
export default function CargaHorariaPage() {
  const [ano, setAno] = useState(2026);
  const { data: cargaHoraria = [], isLoading: loadingCarga } = useListCargaHoraria({ ano });

  // [FIX] Mesma distinção já usada antes: cada disciplina que nunca
  // teve horário gerado mostra um badge neutro "Não gerado ainda"; só
  // disciplinas que JÁ têm horário gerado e mesmo assim estão abaixo
  // do exigido contam como alerta de verdade.
  const disciplinasComAlertaReal = useMemo(
    () => cargaHoraria.filter((c) => c.totalCumprido > 0 && c.status === "insuficiente"),
    [cargaHoraria],
  );
  const disciplinasSemGeracao = useMemo(
    () => cargaHoraria.filter((c) => c.totalCumprido === 0),
    [cargaHoraria],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carga Horária</h1>
          <p className="text-muted-foreground mt-1">Acompanhamento de carga horária cumprida × exigida por disciplina e turma.</p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1565C0]" />
            Carga Horária Cumprida × Exigida
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCarga ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : cargaHoraria.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma turma com disciplinas vinculadas para {ano}.</p>
          ) : (
            <>
              {disciplinasComAlertaReal.length > 0 && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {disciplinasComAlertaReal.length} disciplina{disciplinasComAlertaReal.length > 1 ? "s" : ""} com horário gerado, mas abaixo da carga horária exigida no ano.
                </div>
              )}
              {disciplinasSemGeracao.length > 0 && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-muted/50 text-muted-foreground text-sm">
                  <Circle className="w-3.5 h-3.5 shrink-0" />
                  {disciplinasSemGeracao.length} disciplina{disciplinasSemGeracao.length > 1 ? "s" : ""} ainda sem horário gerado (não conta como insuficiência).
                </div>
              )}
              <div className="divide-y divide-border rounded-lg border border-border/50">
                {cargaHoraria.map((c) => (
                  <div key={`${c.turmaId}-${c.disciplinaId}`} className="flex items-center justify-between py-3 px-4">
                    <div>
                      <p className="text-sm font-medium">{c.disciplinaNome}</p>
                      <p className="text-xs text-muted-foreground">{c.turmaNome} · {c.aulasSemanaGrid} aula{c.aulasSemanaGrid !== 1 ? "s" : ""}/semana na grade (exigido: {c.cargaSemanalExigida})</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{c.totalCumprido} / {c.totalExigido} aulas no ano</span>
                      {c.totalCumprido === 0 ? (
                        <Badge variant="outline" className="text-muted-foreground border-border flex items-center gap-1">
                          <Circle className="w-3 h-3" /> Não gerado
                        </Badge>
                      ) : c.status === "ok" ? (
                        <Badge className="bg-green-100 text-green-700 border-0 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-0 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Insuficiente
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
