import { useState } from "react";
import { useListCalendarioEscolar, useListTrimestresLetivos } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, GraduationCap } from "lucide-react";

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  feriado: { label: "Feriado", color: "bg-red-100 text-red-700" },
  recesso: { label: "Recesso", color: "bg-amber-100 text-amber-700" },
  ponto_facultativo: { label: "Ponto Facultativo", color: "bg-orange-100 text-orange-700" },
  estudo_planejamento: { label: "Estudo e Planejamento", color: "bg-purple-100 text-purple-700" },
  inicio_ano_letivo: { label: "Início do Ano Letivo", color: "bg-green-100 text-green-700" },
  fim_ano_letivo: { label: "Fim do Ano Letivo", color: "bg-green-100 text-green-700" },
  inicio_trimestre: { label: "Início de Trimestre", color: "bg-[#1565C0]/10 text-[#1565C0]" },
  fim_trimestre: { label: "Fim de Trimestre", color: "bg-[#1565C0]/10 text-[#1565C0]" },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

type Evento = { id: number; data: string; tipo: string; descricao: string };

// Agrupa dias consecutivos do mesmo tipo+descrição em um único intervalo,
// pra evitar 10 linhas repetidas de "Recesso Escolar" (13/07, 14/07, 15/07...).
function agruparEventos(eventos: Evento[]) {
  const ordenados = [...eventos].sort((a, b) => a.data.localeCompare(b.data));
  const grupos: { inicio: string; fim: string; tipo: string; descricao: string }[] = [];

  for (const e of ordenados) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.tipo === e.tipo && ultimo.descricao === e.descricao) {
      const diaSeguinte = new Date(ultimo.fim + "T00:00:00");
      diaSeguinte.setDate(diaSeguinte.getDate() + 1);
      const dataEsperada = diaSeguinte.toISOString().slice(0, 10);
      if (dataEsperada === e.data) {
        ultimo.fim = e.data;
        continue;
      }
    }
    grupos.push({ inicio: e.data, fim: e.data, tipo: e.tipo, descricao: e.descricao });
  }
  return grupos;
}

function agruparPorMes(grupos: ReturnType<typeof agruparEventos>) {
  const porMes = new Map<number, typeof grupos>();
  for (const g of grupos) {
    const mes = Number(g.inicio.split("-")[1]) - 1;
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes)!.push(g);
  }
  return [...porMes.entries()].sort((a, b) => a[0] - b[0]);
}

export default function CalendarioEscolarPage() {
  const [ano, setAno] = useState(2026);
  const { data: eventos = [], isLoading: loadingEventos } = useListCalendarioEscolar({ ano });
  const { data: trimestres = [], isLoading: loadingTrimestres } = useListTrimestresLetivos({ ano });

  const totalDiasLetivos = trimestres.reduce((soma, t) => soma + t.diasLetivos, 0);
  const gruposPorMes = agruparPorMes(agruparEventos(eventos));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendário Escolar</h1>
          <p className="text-muted-foreground mt-1">Feriados, recessos e trimestres letivos oficiais (SEED-PR).</p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loadingTrimestres ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          trimestres.map((t) => (
            <Card key={t.id} className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#1565C0]" />
                  {t.trimestre}º Trimestre
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {formatarData(t.dataInicio)} — {formatarData(t.dataFim)}
                </p>
                <p className="text-2xl font-bold mt-2">{t.diasLetivos} <span className="text-sm font-normal text-muted-foreground">dias letivos</span></p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {!loadingTrimestres && trimestres.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Total de <strong>{totalDiasLetivos}</strong> dias letivos em {ano}.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#1565C0]" />
            Eventos do Calendário
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingEventos ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : eventos.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum evento cadastrado para {ano}.</p>
          ) : (
            <div className="space-y-6">
              {gruposPorMes.map(([mes, grupos]) => (
                <div key={mes}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{MESES[mes]}</p>
                  <div className="divide-y divide-border rounded-lg border border-border/50">
                    {grupos.map((g, i) => {
                      const tipo = TIPO_LABELS[g.tipo] ?? { label: g.tipo, color: "bg-gray-100 text-gray-700" };
                      const periodo = g.inicio === g.fim ? formatarData(g.inicio) : `${formatarData(g.inicio)} – ${formatarData(g.fim)}`;
                      return (
                        <div key={i} className="flex items-center justify-between py-3 px-4">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium w-28 shrink-0">{periodo}</span>
                            <span className="text-sm">{g.descricao}</span>
                          </div>
                          <Badge className={`${tipo.color} border-0`}>{tipo.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}