// [PRESENCA-PEDAGOGIA] (28/10/2026) "Onde esta agora": em que turma e sala cada professor esta neste
// momento (grade oficial do dia + reservas de sala), a proxima aula de quem esta livre e a marcacao
// da presenca. Atualiza sozinha a cada minuto.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { buscarAgora, mensagemErro, ROTULO_STATUS, type AgoraLinha } from "@/lib/presenca";

const COR_STATUS: Record<string, string> = { presente: "bg-emerald-600", falta: "bg-red-600", atraso: "bg-amber-500", substituido: "bg-sky-600" };
const sem = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Linha({ l, proxima }: { l: AgoraLinha; proxima?: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", l.status === "falta" && "bg-red-50")}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{l.professor}</div>
        <div className="text-xs text-muted-foreground">
          {proxima ? "Próxima: " : ""}{l.numeroAula}ª aula · {l.hora}–{l.fim} · {l.turmas}{l.disciplinas && ` · ${l.disciplinas}`}
        </div>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <div className={cn("text-sm font-semibold flex items-center gap-1 justify-end", !l.sala && "text-muted-foreground font-normal")}>
          <MapPin className="w-3.5 h-3.5" />{l.sala || "sala da turma"}
        </div>
        {l.status && <Badge className={COR_STATUS[l.status]}>{ROTULO_STATUS[l.status]}</Badge>}
      </div>
    </div>
  );
}

export default function OndeEstaPage() {
  const [busca, setBusca] = useState("");
  const q = useQuery({ queryKey: ["onde-esta"], queryFn: buscarAgora, refetchInterval: 60_000, retry: false });
  const r = q.data;
  const filtro = (xs: AgoraLinha[]) => (busca.trim() ? xs.filter((x) => sem(x.professor).includes(sem(busca.trim())) || sem(x.turmas).includes(sem(busca.trim()))) : xs);
  const emAula = useMemo(() => filtro(r?.emAula ?? []), [r, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const proximas = useMemo(() => filtro(r?.proximas ?? []), [r, busca]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6" /> Onde está agora</h1>
          <p className="text-muted-foreground text-sm">Em que turma e sala cada professor está neste momento, pela grade do dia e pelas reservas de sala.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {r && <Badge variant="secondary" className="text-sm"><Clock className="w-3.5 h-3.5 mr-1" />{r.diaSemana ? `${r.diaSemana}, ` : ""}{r.hora}</Badge>}
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar professor ou turma" className="pl-8" />
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/presenca">Marcar presença</Link></Button>
      </div>

      {r?.aviso && <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{r.aviso}</div>}
      {q.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>}
      {q.isError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mensagemErro(q.error) ?? "Não foi possível carregar."}</div>}

      {r && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Em aula agora ({emAula.length})</CardTitle></CardHeader>
            <CardContent className="p-0 divide-y">
              {emAula.length ? emAula.map((l) => <Linha key={l.professorId} l={l} />) : <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhum professor em aula neste horário (intervalo ou fora do turno).</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Próxima aula ({proximas.length})</CardTitle></CardHeader>
            <CardContent className="p-0 divide-y">
              {proximas.length ? proximas.map((l) => <Linha key={l.professorId} l={l} proxima />) : <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhuma aula depois deste horário hoje.</p>}
            </CardContent>
          </Card>
        </div>
      )}
      {r && r.livres.length > 0 && !busca && (
        <p className="text-xs text-muted-foreground">Já terminaram as aulas de hoje: {r.livres.map((l) => l.professor).join(", ")}.</p>
      )}
    </div>
  );
}
