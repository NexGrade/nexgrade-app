import { useState, useMemo } from "react";
import { useListCalendarioEscolar, useListTrimestresLetivos, useListCargaHoraria } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, GraduationCap, BarChart3, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

const TIPO_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  feriado: { label: "Feriado", color: "bg-red-100 text-red-700", dot: "bg-red-500" },
  recesso: { label: "Recesso", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  ponto_facultativo: { label: "Ponto Facultativo", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  estudo_planejamento: { label: "Estudo e Planejamento", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  inicio_ano_letivo: { label: "Início do Ano Letivo", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  fim_ano_letivo: { label: "Fim do Ano Letivo", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  inicio_trimestre: { label: "Início de Trimestre", color: "bg-[#1565C0]/10 text-[#1565C0]", dot: "bg-[#1565C0]" },
  fim_trimestre: { label: "Fim de Trimestre", color: "bg-[#1565C0]/10 text-[#1565C0]", dot: "bg-[#1565C0]" },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

type Evento = { id: number; data: string; tipo: string; descricao: string };

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

// Monta o grid de um mês: array de semanas, cada semana com 7 células
// (dia do mês ou null pra célula vazia antes/depois do mês).
function montarGridMes(ano: number, mes: number, eventosPorDia: Map<string, Evento[]>) {
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  const offsetInicial = primeiroDia.getDay(); // 0 = domingo
  const totalDias = ultimoDia.getDate();

  const celulas: { dia: number | null; dataStr: string | null; eventos: Evento[] }[] = [];
  for (let i = 0; i < offsetInicial; i++) celulas.push({ dia: null, dataStr: null, eventos: [] });
  for (let d = 1; d <= totalDias; d++) {
    const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    celulas.push({ dia: d, dataStr, eventos: eventosPorDia.get(dataStr) ?? [] });
  }
  while (celulas.length % 7 !== 0) celulas.push({ dia: null, dataStr: null, eventos: [] });

  const semanas: typeof celulas[] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

export default function CalendarioEscolarPage() {
  const [ano, setAno] = useState(2026);
  const [mesAtual, setMesAtual] = useState(() => new Date().getMonth());
  const { data: eventos = [], isLoading: loadingEventos } = useListCalendarioEscolar({ ano });
  const { data: trimestres = [], isLoading: loadingTrimestres } = useListTrimestresLetivos({ ano });
  const { data: cargaHoraria = [], isLoading: loadingCarga } = useListCargaHoraria({ ano });

  const totalDiasLetivos = trimestres.reduce((soma, t) => soma + t.diasLetivos, 0);
  const disciplinasInsuficientes = cargaHoraria.filter((c) => c.status === "insuficiente").length;

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of eventos) {
      if (!mapa.has(e.data)) mapa.set(e.data, []);
      mapa.get(e.data)!.push(e);
    }
    return mapa;
  }, [eventos]);

  const semanas = useMemo(() => montarGridMes(ano, mesAtual, eventosPorDia), [ano, mesAtual, eventosPorDia]);

  const gruposDoMes = useMemo(() => {
    const eventosDoMes = eventos.filter((e) => Number(e.data.split("-")[1]) - 1 === mesAtual);
    return agruparEventos(eventosDoMes);
  }, [eventos, mesAtual]);

  const tiposPresentesNoMes = useMemo(() => {
    const tipos = new Set<string>();
    for (const g of gruposDoMes) tipos.add(g.tipo);
    return [...tipos];
  }, [gruposDoMes]);

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
              {disciplinasInsuficientes > 0 && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {disciplinasInsuficientes} disciplina{disciplinasInsuficientes > 1 ? "s" : ""} abaixo da carga horária exigida no ano.
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
                      {c.status === "ok" ? (
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#1565C0]" />
            {MESES[mesAtual]} de {ano}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMesAtual((m) => (m === 0 ? 11 : m - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(mesAtual)} onValueChange={(v) => setMesAtual(Number(v))}>
              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMesAtual((m) => (m === 11 ? 0 : m + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingEventos ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : (
            <>
              <div className="grid grid-cols-7 border border-border/60 rounded-t-lg overflow-hidden bg-muted/40">
                {DIAS_SEMANA.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-2 border-r border-border/40 last:border-r-0">
                    {d}
                  </div>
                ))}
              </div>
              <div className="border-x border-b border-border/60 rounded-b-lg overflow-hidden">
                {semanas.map((semana, si) => (
                  <div key={si} className="grid grid-cols-7">
                    {semana.map((cel, ci) => {
                      const hoje = cel.dataStr === new Date().toISOString().slice(0, 10);
                      return (
                        <div
                          key={ci}
                          className={`min-h-[84px] p-1.5 border-r border-b border-border/40 last:border-r-0 ${si === semanas.length - 1 ? "last:border-b-0" : ""} ${!cel.dia ? "bg-muted/20" : "bg-background"}`}
                        >
                          {cel.dia && (
                            <>
                              <span className={`text-xs font-medium inline-flex items-center justify-center ${hoje ? "w-5 h-5 rounded-full bg-[#1565C0] text-white" : "text-foreground"}`}>
                                {cel.dia}
                              </span>
                              <div className="mt-1 space-y-0.5">
                                {cel.eventos.slice(0, 3).map((ev, i) => {
                                  const tipo = TIPO_LABELS[ev.tipo] ?? { label: ev.tipo, color: "bg-gray-100 text-gray-700", dot: "bg-gray-400" };
                                  return (
                                    <div
                                      key={i}
                                      title={`${tipo.label}: ${ev.descricao}`}
                                      className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded truncate ${tipo.color}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tipo.dot}`} />
                                      <span className="truncate">{ev.descricao}</span>
                                    </div>
                                  );
                                })}
                                {cel.eventos.length > 3 && (
                                  <p className="text-[10px] text-muted-foreground px-1">+{cel.eventos.length - 3} mais</p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {tiposPresentesNoMes.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-4">
                  {tiposPresentesNoMes.map((tipoKey) => {
                    const tipo = TIPO_LABELS[tipoKey] ?? { label: tipoKey, color: "", dot: "bg-gray-400" };
                    return (
                      <div key={tipoKey} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`w-2 h-2 rounded-full ${tipo.dot}`} />
                        {tipo.label}
                      </div>
                    );
                  })}
                </div>
              )}

              {gruposDoMes.length === 0 && (
                <p className="text-muted-foreground text-center py-4 text-sm">Nenhum evento cadastrado para {MESES[mesAtual]}.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
