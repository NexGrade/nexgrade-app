// [CALENDARIO-PROFESSOR] (17/10/2026) Calendario do mes no mesmo visual da tela Calendario Escolar
// (tons por trimestre, semanas intercaladas, feriado/recesso pintados, etiquetas de cada data).
// So consulta: usado no app do professor (Minha Agenda). As cores vem de calendario-cores.ts,
// as mesmas da tela do sistema.
import { useMemo, useState } from "react";
import { useListCalendarioEscolar, useListTrimestresLetivos } from "@workspace/api-client-react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COR_TRIMESTRE, DIAS_SEMANA, FUNDO_DIA, MESES, TIPO_LABELS, tipoDoEvento } from "@/lib/calendario-cores";

type Evento = { id: number; data: string; tipo: string; descricao: string; diaLetivo?: boolean };
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function agrupar(eventos: Evento[]) {
  const grupos: { inicio: string; fim: string; tipo: string; descricao: string }[] = [];
  for (const e of [...eventos].sort((a, b) => a.data.localeCompare(b.data))) {
    const g = grupos.find((x) => x.tipo === e.tipo && x.descricao === e.descricao && (() => {
      const seg = new Date(x.fim + "T12:00:00");
      seg.setDate(seg.getDate() + 1);
      return isoLocal(seg) === e.data;
    })());
    if (g) g.fim = e.data;
    else grupos.push({ inicio: e.data, fim: e.data, tipo: e.tipo, descricao: e.descricao });
  }
  return grupos;
}

export function CalendarioMesEscola() {
  const hojeISO = isoLocal(new Date());
  const [ref, setRef] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() }; });
  const { ano, mes } = ref;
  const { data: eventos = [], isLoading } = useListCalendarioEscolar({ ano });
  const { data: trimestres = [] } = useListTrimestresLetivos({ ano });

  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of eventos as Evento[]) {
      if (!m.has(e.data)) m.set(e.data, []);
      m.get(e.data)!.push(e);
    }
    return m;
  }, [eventos]);

  const semanas = useMemo(() => {
    const cel: Array<string | null> = [
      ...Array.from({ length: new Date(ano, mes, 1).getDay() }, () => null),
      ...Array.from({ length: new Date(ano, mes + 1, 0).getDate() }, (_, i) => isoLocal(new Date(ano, mes, i + 1))),
    ];
    while (cel.length % 7) cel.push(null);
    const s: Array<Array<string | null>> = [];
    for (let i = 0; i < cel.length; i += 7) s.push(cel.slice(i, i + 7));
    return s;
  }, [ano, mes]);

  const prefixo = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const grupos = useMemo(() => agrupar((eventos as Evento[]).filter((e) => e.data.startsWith(prefixo))), [eventos, prefixo]);
  const tiposNoMes = [...new Set(grupos.map((g) => g.tipo))];
  const trimestreDaData = (data: string) => {
    const t = trimestres.find((x) => data >= x.dataInicio && data <= x.dataFim);
    return t ? (t.trimestre - 1) % 4 : -1;
  };
  const mudar = (delta: number) => setRef(({ ano: a, mes: m }) => {
    const d = new Date(a, m + delta, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });

  return (
    <Card className="print:hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 mb-3 rounded-t-xl bg-gradient-to-r from-sky-50 via-white to-violet-50 border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#1565C0]" />
          {MESES[mes]} de {ano}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudar(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => { const d = new Date(); setRef({ ano: d.getFullYear(), mes: d.getMonth() }); }}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudar(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-80 rounded-lg" />
        ) : (
          <>
            <div className="grid grid-cols-7 border border-border/60 rounded-t-lg overflow-hidden bg-[#1565C0]/5">
              {DIAS_SEMANA.map((d, di) => (
                <div key={d} className={`text-center text-[11px] font-semibold uppercase tracking-wide py-2 border-r border-border/40 last:border-r-0 ${di === 0 || di === 6 ? "text-slate-400" : "text-[#1565C0]/80"}`}>
                  {d}
                </div>
              ))}
            </div>
            <div className="border-x border-b border-border/60 rounded-b-lg overflow-hidden">
              {semanas.map((semana, si) => (
                <div key={si} className="grid grid-cols-7">
                  {semana.map((data, ci) => {
                    const evs = data ? porDia.get(data) ?? [] : [];
                    const fimDeSemana = ci === 0 || ci === 6;
                    const tipoForte = evs.find((e) => FUNDO_DIA[e.tipo] && !e.diaLetivo)?.tipo;
                    const tri = data ? trimestreDaData(data) : -1;
                    const fundo = !data ? "bg-muted/20"
                      : tipoForte ? FUNDO_DIA[tipoForte]
                      : fimDeSemana ? (si % 2 ? "bg-slate-100/80" : "bg-slate-50")
                      : tri >= 0 ? (si % 2 ? COR_TRIMESTRE[tri].dia2 : COR_TRIMESTRE[tri].dia)
                      : si % 2 ? "bg-muted/30" : "bg-background";
                    return (
                      <div
                        key={ci}
                        title={evs.map((e) => `${tipoDoEvento(e.tipo).label}: ${e.descricao}`).join("\n") || undefined}
                        className={`min-h-[56px] sm:min-h-[84px] p-1 sm:p-1.5 border-r border-b border-border/40 last:border-r-0 ${si === semanas.length - 1 ? "last:border-b-0" : ""} ${fundo}`}
                      >
                        {data && (
                          <>
                            <span className={`text-xs font-medium inline-flex items-center justify-center ${data === hojeISO ? "w-5 h-5 rounded-full bg-[#1565C0] text-white shadow" : fimDeSemana ? "text-slate-400" : "text-foreground"}`}>
                              {Number(data.slice(8, 10))}
                            </span>
                            {/* celular: so as bolinhas; tela maior: etiqueta com o nome */}
                            <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                              {evs.slice(0, 3).map((ev, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${tipoDoEvento(ev.tipo).dot}`} />)}
                            </div>
                            <div className="mt-1 space-y-0.5 hidden sm:block">
                              {evs.slice(0, 3).map((ev, i) => {
                                const tipo = tipoDoEvento(ev.tipo);
                                return (
                                  <div key={i} className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded truncate ${tipo.color}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tipo.dot}`} />
                                    <span className="truncate">{ev.descricao}</span>
                                  </div>
                                );
                              })}
                              {evs.length > 3 && <p className="text-[10px] text-muted-foreground px-1">+{evs.length - 3} mais</p>}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {(tiposNoMes.length > 0 || trimestres.length > 0) && (
              <div className="flex flex-wrap gap-3 mt-4">
                {trimestres.map((t) => (
                  <div key={"tri" + t.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`w-3 h-3 rounded border ${COR_TRIMESTRE[(t.trimestre - 1) % 4].dia} ${COR_TRIMESTRE[(t.trimestre - 1) % 4].borda}`} />
                    {t.trimestre}º trimestre
                  </div>
                ))}
                {tiposNoMes.map((k) => (
                  <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`w-2 h-2 rounded-full ${tipoDoEvento(k).dot}`} />
                    {tipoDoEvento(k).label}
                  </div>
                ))}
              </div>
            )}

            {grupos.length === 0 ? (
              <p className="text-muted-foreground text-center py-4 text-sm">Nenhuma data especial em {MESES[mes]}.</p>
            ) : (
              <div className="mt-4 border-t pt-3 space-y-1.5">
                <p className="text-sm font-semibold">Datas de {MESES[mes]}</p>
                {grupos.map((g) => {
                  const tipo = tipoDoEvento(g.tipo);
                  return (
                    <div key={g.inicio + g.tipo + g.descricao} className="flex items-center gap-3 text-sm">
                      <span className="w-[4.5rem] shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {g.inicio === g.fim ? ddmm(g.inicio) : `${g.inicio.slice(8, 10)} a ${ddmm(g.fim)}`}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">{g.descricao}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${tipo.color}`}>{tipo.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
