import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DIA_CURTO, NOME_TURNO, abreviarNome, abreviarSala, rotuloAulas } from "@/lib/reservas-formato";

// [RESERVAS-DA-SEMANA] (17/10/2026) Card do gestor de reservas (portal e app do gestor): tudo o que
// esta reservado de segunda a sexta da semana da data escolhida, espacos e tablets, um dia por linha.
type EspacoSemana = { id: number; data: string; numeroAula: number; turno: string | null; titulo: string; status: string; salaNome: string; professorNome: string };
type TabletSemana = { id: number; data: string; numeroAula: number; turno: string; titulo: string; status: string; quantidade: number; recursoNome: string; professorNome: string };
type SemanaResp = { inicio: string; fim: string; espacos: EspacoSemana[]; tablets: TabletSemana[] };

export const CHAVE_RESERVAS_SEMANA = ["reservas-semana"] as const;

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// segunda-feira da semana da data (sabado e domingo contam para a semana que termina)
const segundaDe = (iso: string) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return somaDias(iso, dow === 0 ? -6 : 1 - dow);
};

type Topico = { chave: string; nome: string; professor: string; status: string; turno: string | null; aulas: number[] };

function topicosDoDia(espacos: EspacoSemana[], tablets: TabletSemana[]): Topico[] {
  const mapa = new Map<string, Topico>();
  const juntar = (chave: string, base: Omit<Topico, "chave" | "aulas">, aula: number) => {
    const t = mapa.get(chave) ?? { chave, ...base, aulas: [] };
    t.aulas.push(aula);
    mapa.set(chave, t);
  };
  for (const e of espacos) juntar(`e|${e.salaNome}|${e.professorNome}|${e.status}|${e.turno ?? ""}`, { nome: abreviarSala(e.salaNome), professor: e.professorNome, status: e.status, turno: e.turno }, e.numeroAula);
  for (const t of tablets) juntar(`t|${t.recursoNome}|${t.quantidade}|${t.professorNome}|${t.status}|${t.turno}`, { nome: `${t.recursoNome} · ${t.quantidade} un.`, professor: t.professorNome, status: t.status, turno: t.turno }, t.numeroAula);
  return [...mapa.values()]
    .map((t) => ({ ...t, aulas: [...new Set(t.aulas)].sort((a, b) => a - b) }))
    .sort((a, b) => a.aulas[0]! - b.aulas[0]! || a.nome.localeCompare(b.nome));
}

export function ReservasDaSemana({ data, onEscolherDia }: { data: string; onEscolherDia?: (iso: string) => void }) {
  const segunda = useMemo(() => segundaDe(data), [data]);
  const { data: semana, isLoading, isError } = useQuery({
    queryKey: [...CHAVE_RESERVAS_SEMANA, segunda],
    queryFn: () => customFetch<SemanaResp>(`/api/reservas/gestor/semana?data=${segunda}`, { responseType: "json" }),
  });
  const dias = useMemo(() => Array.from({ length: 5 }, (_, i) => somaDias(segunda, i)), [segunda]);
  const total = (semana?.espacos.length ?? 0) + (semana?.tablets.length ?? 0);
  const aguardando = (semana?.espacos.filter((e) => e.status === "pendente").length ?? 0) + (semana?.tablets.filter((t) => t.status === "pendente").length ?? 0);

  return (
    <Card className="border-card-border bg-card shadow-[0_8px_24px_hsl(174_29%_14%/_.04)]" data-testid="card-reservas-semana">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-heading text-lg font-bold">
            <CalendarDays className="h-5 w-5 text-primary" /> Reservas da semana
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{ddmm(dias[0]!)} a {ddmm(dias[4]!)} · segunda a sexta</p>
        </div>
        {semana && (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">{total} {total === 1 ? "reserva" : "reservas"}</Badge>
            {aguardando > 0 && <Badge className="border border-[#ead58b] bg-[#fff7d7] text-[#796116] hover:bg-[#fff7d7]">{aguardando} aguardando</Badge>}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : isError || !semana ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar as reservas da semana.</p>
        ) : (
          dias.map((dia) => {
            const topicos = topicosDoDia(semana.espacos.filter((e) => String(e.data).slice(0, 10) === dia), semana.tablets.filter((t) => String(t.data).slice(0, 10) === dia));
            const escolhido = dia === data;
            return (
              <div key={dia} className={`flex items-start gap-3 rounded-lg px-2 py-2 text-sm ${escolhido ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}>
                <button
                  type="button"
                  onClick={() => onEscolherDia?.(dia)}
                  className="w-14 shrink-0 pt-0.5 text-left text-xs font-semibold tabular-nums text-primary hover:underline"
                  title="Ver este dia"
                >
                  {ddmm(dia)}
                  <span className="block font-normal text-muted-foreground">{DIA_CURTO[new Date(`${dia}T12:00:00`).getDay()]}</span>
                </button>
                {topicos.length === 0 ? (
                  <p className="pt-0.5 text-xs text-muted-foreground">Sem reservas</p>
                ) : (
                  <ul className="min-w-0 flex-1 space-y-1">
                    {topicos.map((t) => (
                      <li key={t.chave} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-snug before:mr-0.5 before:text-primary before:content-['•']">
                        <span className="min-w-0 break-words font-medium">{t.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {rotuloAulas(t.aulas)}
                          {t.turno ? ` · ${NOME_TURNO[t.turno] ?? t.turno}` : ""} · {abreviarNome(t.professor)}
                        </span>
                        <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${t.status === "pendente" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                          {t.status === "pendente" ? "Aguardando" : "Confirmada"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
