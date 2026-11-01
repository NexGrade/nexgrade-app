import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { PreenchimentoReserva } from "@/components/nova-reserva-dialog";

// [QUADRO-SEMANA] (24/10/2026) Quadro da semana em grade: um periodo por vez, aulas nas linhas e
// segunda a sexta nas colunas. Equipe: o que esta reservado (espaco: professor) e os espacos livres.
// Professor (Minha Agenda): so os espacos livres, sem nomes; clica so nas aulas dele.
// Clicar numa aula livre abre a Nova reserva ja com o dia, o periodo, a aula e o espaco (se filtrado).
type Reservada = { texto: string; pendente: boolean; salaId: number | null };
type Quadro = {
  inicio: string;
  fim: string;
  dias: string[];
  espacos: Array<{ id: number; nome: string }>;
  turnos: Array<{ turno: string; aulas: Array<{ numeroAula: number; horaInicio: string; livres: number[][]; reservadas: Reservada[][] }> }>;
};
type AulaProfessor = { diaSemana: number; numeroAula: number; turno: string; turmaNome: string };

const NOME_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hojeISO = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
};
// mesmas abreviacoes do PDF
const abreviar = (nome: string) =>
  nome
    .replace(/^Laborat[óo]rio\s+(de\s+|da\s+|do\s+)?/i, "Lab. ")
    .replace(/Inform[áa]tica/gi, "Info.")
    .replace(/Ci[êe]ncias/gi, "Ciên.")
    .replace(/Biblioteca/gi, "Bibl.")
    .replace(/Audit[óo]rio/gi, "Audit.")
    .replace(/\bBloco\s+(\d+)/gi, "B$1")
    .replace(/Poliesportiva/gi, "Poli.")
    .replace(/Programa[çc][ãa]o/gi, "Prog.")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

export function QuadroSemanaReservas({ modo, data, onMudarData, onReservar }: {
  modo: "gestor" | "professor";
  data: string; // qualquer dia da semana mostrada
  onMudarData: (iso: string) => void;
  onReservar: (p: PreenchimentoReserva) => void;
}) {
  const gestor = modo === "gestor";
  const url = gestor ? "/api/reservas/gestor/quadro-semana" : "/api/minha-agenda/espacos-livres-semana";
  const { data: quadro, isLoading, isError } = useQuery({
    queryKey: ["quadro-semana", modo, data],
    queryFn: () => customFetch<Quadro>(`${url}?data=${data}`, { responseType: "json" }),
  });
  // professor: as aulas dele (so nelas ele pode reservar)
  const { data: horarioProf } = useQuery({
    queryKey: ["horario-reserva", "quadro", "professor"],
    queryFn: () => customFetch<{ aulas: AulaProfessor[] }>("/api/minha-agenda/horario", { responseType: "json" }),
    enabled: !gestor,
  });
  const [turnoEsc, setTurnoEsc] = useState<string | null>(null);
  const [espaco, setEspaco] = useState(0); // 0 = todos

  const turnosVisiveis = useMemo(() => {
    if (!quadro) return [];
    if (gestor) return quadro.turnos;
    const meus = new Set((horarioProf?.aulas ?? []).map((a) => a.turno));
    const f = quadro.turnos.filter((t) => meus.has(t.turno));
    return f.length ? f : quadro.turnos;
  }, [quadro, gestor, horarioProf]);
  const turno = turnosVisiveis.find((t) => t.turno === turnoEsc) ?? turnosVisiveis[0];
  const hoje = hojeISO();
  const nomeDe = useMemo(() => new Map((quadro?.espacos ?? []).map((e) => [e.id, abreviar(e.nome)])), [quadro]);
  const minhaAula = (d: number, n: number) => (horarioProf?.aulas ?? []).find((a) => a.turno === turno?.turno && a.diaSemana === d && a.numeroAula === n);

  return (
    <div className="space-y-3" data-testid="quadro-semana-reservas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Semana anterior" onClick={() => onMudarData(somaDias(quadro?.inicio ?? data, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[120px] text-center text-sm font-semibold tabular-nums">{quadro ? `${ddmm(quadro.inicio)} a ${ddmm(quadro.fim)}` : "…"}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Próxima semana" onClick={() => onMudarData(somaDias(quadro?.inicio ?? data, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {turnosVisiveis.length > 1 && (
            <div className="flex rounded-lg border p-0.5">
              {turnosVisiveis.map((t) => (
                <button key={t.turno} type="button" onClick={() => setTurnoEsc(t.turno)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${t.turno === turno?.turno ? "bg-[#1565C0] text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  {NOME_TURNO[t.turno] ?? t.turno}
                </button>
              ))}
            </div>
          )}
          {quadro && quadro.espacos.length > 1 && (
            <Select value={String(espaco)} onValueChange={(v) => setEspaco(Number(v))}>
              <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todos os espaços</SelectItem>
                {quadro.espacos.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" />
        : isError || !quadro ? <p className="text-sm text-muted-foreground">Não foi possível carregar o quadro da semana.</p>
        : !turno ? <p className="text-sm text-muted-foreground">Nenhum horário de aula cadastrado.</p>
        : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-[#0D47A1] text-white">
                <th className="sticky left-0 z-10 w-14 bg-[#0D47A1] px-2 py-2 text-left font-semibold">Aula</th>{/* [CELULAR-RESERVAS] coluna fixa ao rolar */}
                {quadro.dias.map((d, i) => (
                  <th key={d} className={`px-2 py-2 text-center font-semibold ${d === hoje ? "bg-[#1565C0]" : ""}`}>
                    {DIAS[i]}<span className="block text-[10px] font-normal opacity-80">{ddmm(d)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {turno.aulas.map((a) => (
                <tr key={a.numeroAula} className="border-t align-top">
                  <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-mono font-bold text-[#1565C0]">{a.numeroAula}ª<span className="block font-sans text-[10px] font-normal text-muted-foreground">{a.horaInicio}</span></td>
                  {quadro.dias.map((dia, d) => {
                    const passado = dia < hoje;
                    const livresTodos = a.livres[d] ?? [];
                    const livres = espaco ? livresTodos.filter((id) => id === espaco) : livresTodos;
                    const reservadas = (a.reservadas[d] ?? []).filter((r) => !espaco || r.salaId === espaco);
                    const minha = gestor ? null : minhaAula(d, a.numeroAula);
                    const podeReservar = !passado && livres.length > 0 && (gestor || !!minha);
                    const abrir = () => podeReservar && onReservar({ data: dia, turno: turno.turno, numeroAula: a.numeroAula, salaId: espaco || undefined });
                    return (
                      <td key={dia} className={`border-l p-0 ${passado ? "bg-muted/40" : ""}`}>
                        <div
                          role={podeReservar ? "button" : undefined}
                          tabIndex={podeReservar ? 0 : undefined}
                          onClick={abrir}
                          onKeyDown={(e) => { if (podeReservar && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); } }}
                          title={podeReservar ? "Reservar nesta aula" : undefined}
                          className={`group min-h-[44px] space-y-0.5 px-2 py-1.5 ${podeReservar ? "cursor-pointer hover:bg-[#E3F2FD]" : ""}`}
                        >
                          {!gestor && minha && <p className="truncate font-semibold text-foreground">Sua aula: {minha.turmaNome}</p>}
                          {reservadas.map((r, k) => (
                            <p key={k} className={`truncate font-medium ${r.pendente ? "text-amber-700" : "text-[#1565C0]"}`} title={r.texto + (r.pendente ? " (aguardando)" : "")}>
                              {r.texto}{r.pendente ? " (aguard.)" : ""}
                            </p>
                          ))}
                          {passado ? null
                            : livres.length === 0 ? <p className="font-semibold text-red-700">{espaco ? "Ocupado" : "Nenhum livre"}</p>
                            : espaco ? <p className="font-medium text-emerald-700">Livre</p>
                            : livres.length === quadro.espacos.length ? <p className="font-medium text-emerald-700">Livres: todos</p>
                            : <p className="text-emerald-700" title={livres.map((id) => nomeDe.get(id)).join(", ")}>Livres: {livres.map((id) => nomeDe.get(id)).join(", ")}</p>}
                          {podeReservar && <p className="flex items-center gap-0.5 font-semibold text-[#1565C0] md:hidden md:group-hover:flex"><Plus className="h-3 w-3" /> Reservar</p>}{/* [CELULAR-RESERVAS] no celular sempre visivel (nao ha mouse) */}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {gestor
          ? "Azul = reservado · laranja = aguardando · verde = espaços livres. Clique numa aula para reservar já com o dia e a aula."
          : "Verde = espaços livres. Você pode reservar nas suas aulas: clique na aula para abrir a reserva já preenchida."}
      </p>
    </div>
  );
}
