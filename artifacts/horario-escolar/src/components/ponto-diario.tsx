// [PONTO-DIARIO] (15/10/2026) Ponto de um dia: escolhe a data e o turno e baixa em PDF
// (gerado no servidor) ou em Excel (montado aqui com xlsx a partir de ?formato=json).
import { useState } from "react";
import * as XLSX from "xlsx";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Celula = { texto: string; tipo: "aula" | "ha" | "atividade" | "indisponivel" | "livre" };
type Ponto = {
  escola: string; data: string; dataBR: string; diaSemana: string; aviso: string | null;
  turnos: Array<{ turno: string; rotulo: string; colunas: Array<{ numeroAula: number; hora: string }>; linhas: Array<{ professor: string; celulas: Celula[] }> }>;
};

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const NOME_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function CardPontoDiario() {
  const { toast } = useToast();
  const [data, setData] = useState(hojeLocal());
  const [turno, setTurno] = useState("matutino");
  const [gerando, setGerando] = useState<"pdf" | "xlsx" | null>(null);
  const diaDaSemana = data ? NOME_DIA[new Date(`${data}T12:00:00`).getDay()] : "";
  const fimDeSemana = diaDaSemana === "sábado" || diaDaSemana === "domingo";

  const url = (formato?: string) => {
    const u = new URL("/api/export/ponto-diario", window.location.origin);
    u.searchParams.set("data", data);
    u.searchParams.set("turno", turno);
    if (formato) u.searchParams.set("formato", formato);
    return u.toString();
  };
  const erro = (e: unknown) => {
    const msg = e instanceof ApiError && e.data && typeof e.data === "object" && "error" in (e.data as object) ? String((e.data as { error: string }).error) : e instanceof Error ? e.message : undefined;
    toast({ title: "Não foi possível gerar o ponto", description: msg, variant: "destructive" });
  };

  const baixarPdf = async () => {
    setGerando("pdf");
    try {
      const blob = await customFetch<Blob>(url(), { responseType: "blob" });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `ponto_diario_${data}_${turno}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) { erro(e); } finally { setGerando(null); }
  };

  const baixarExcel = async () => {
    setGerando("xlsx");
    try {
      const p = await customFetch<Ponto>(url("json"));
      const wb = XLSX.utils.book_new();
      for (const t of p.turnos) {
        const cab = ["Professor", ...t.colunas.map((c) => `${c.numeroAula}ª aula (${c.hora})`), "Entrada", "Saída", "Observação / assinatura"];
        const linhas = t.linhas.map((l) => [l.professor, ...l.celulas.map((c) => (c.tipo === "indisponivel" ? "-----" : c.texto)), "", "", ""]);
        const aoa: (string | number)[][] = [
          [p.escola],
          [`Ponto diário · ${t.rotulo} · ${p.diaSemana}, ${p.dataBR}`],
          ...(p.aviso ? [[p.aviso]] : []),
          [],
          cab,
          ...(linhas.length ? linhas : [["Nenhum professor com aula ou hora-atividade neste turno."]]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [{ wch: 28 }, ...t.colunas.map(() => ({ wch: 18 })), { wch: 10 }, { wch: 10 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, t.rotulo);
      }
      XLSX.writeFile(wb, `ponto_diario_${data}_${turno}.xlsx`);
    } catch (e) { erro(e); } finally { setGerando(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="w-4 h-4" /> Ponto Diário
        </CardTitle>
        <CardDescription>Folha de ponto de um dia: aulas, hora-atividade e atividades de cada professor, com campos de entrada, saída e observação.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ponto-dia">Dia</Label>
            <Input id="ponto-dia" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            {data && <p className={`text-xs ${fimDeSemana ? "text-destructive" : "text-muted-foreground"}`}>{diaDaSemana}{fimDeSemana ? ": sem grade" : ""}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="matutino">Manhã</SelectItem>
                <SelectItem value="vespertino">Tarde</SelectItem>
                <SelectItem value="noturno">Noite</SelectItem>
                <SelectItem value="todos">Todos (um por página)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button disabled={!data || fimDeSemana || gerando !== null} onClick={baixarPdf}>
            {gerando === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}{gerando === "pdf" ? "Gerando..." : "Baixar PDF"}
          </Button>
          <Button variant="outline" disabled={!data || fimDeSemana || gerando !== null} onClick={baixarExcel}>
            {gerando === "xlsx" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}{gerando === "xlsx" ? "Gerando..." : "Baixar Excel"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
