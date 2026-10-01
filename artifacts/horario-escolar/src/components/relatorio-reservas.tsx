// [RELATORIO-RESERVAS] (2026-10-01) Relatorio de reservas por professor (todas,
// inclusive canceladas). PDF gerado no backend (/api/export/reservas-pdf); Excel
// montado aqui com xlsx a partir de /api/export/reservas-dados (mesmas linhas do PDF).
import { useState } from "react";
import * as XLSX from "xlsx";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, FileSpreadsheet, FileBarChart, Loader2 } from "lucide-react";

type LinhaReserva = {
  professorId: number;
  professor: string;
  data: string;
  diaSemana: number;
  numeroAula: number;
  turno: string | null;
  sala: string;
  titulo: string;
  observacoes: string | null;
  status: string;
  prioridade: number;
  criadaEm: string;
};

const NOME_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ROTULO_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const ROTULO_STATUS: Record<string, string> = { confirmada: "Confirmada", pendente: "Pendente", cancelada: "Cancelada" };

const isoLocal = (d: Date) => d.toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso do navegador
const dataBR = (iso: string) => { const [a, m, d] = iso.split("-"); return a && m && d ? d + "/" + m + "/" + a : iso; };
const diaDaData = (iso: string) => { const d = new Date(iso + "T12:00:00"); return Number.isNaN(d.getTime()) ? "" : NOME_DIA[d.getDay()]; };

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function BotaoRelatorioReservas() {
  const { toast } = useToast();
  const hoje = new Date();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [fim, setFim] = useState(isoLocal(hoje));
  const [gerando, setGerando] = useState<"pdf" | "xlsx" | null>(null);

  const periodoValido = !!inicio && !!fim && inicio <= fim;
  const qs = "inicio=" + encodeURIComponent(inicio) + "&fim=" + encodeURIComponent(fim);
  const sufixo = "_" + inicio + "_a_" + fim;

  const falhou = (err: unknown) =>
    toast({
      title: "Não foi possível gerar o relatório",
      description: (err as { data?: { error?: string }; message?: string })?.data?.error ?? (err as Error)?.message,
      variant: "destructive",
    });

  const baixarPdf = async () => {
    setGerando("pdf");
    try {
      const blob = await customFetch<Blob>("/api/export/reservas-pdf?" + qs, { responseType: "blob" });
      baixarBlob(blob, "reservas_por_professor" + sufixo + ".pdf");
      toast({ title: "PDF gerado" });
    } catch (err) { falhou(err); } finally { setGerando(null); }
  };

  const baixarExcel = async () => {
    setGerando("xlsx");
    try {
      const linhas = await customFetch<LinhaReserva[]>("/api/export/reservas-dados?" + qs, { responseType: "json" });
      const detalhe = linhas.map((r) => ({
        Professor: r.professor,
        Data: dataBR(r.data),
        Dia: diaDaData(r.data),
        Aula: r.numeroAula + "ª",
        Turno: r.turno ? ROTULO_TURNO[r.turno] ?? r.turno : "",
        Sala: r.sala,
        "Título": r.titulo,
        Status: ROTULO_STATUS[r.status] ?? r.status,
        Prioridade: r.prioridade,
        "Observações": r.observacoes ?? "",
        "Criada em": r.criadaEm ? new Date(r.criadaEm).toLocaleString("pt-BR") : "",
      }));

      const porProf = new Map<string, { Professor: string; Total: number; Confirmadas: number; Pendentes: number; Canceladas: number }>();
      for (const r of linhas) {
        const k = r.professorId + "|" + r.professor;
        const g = porProf.get(k) ?? { Professor: r.professor, Total: 0, Confirmadas: 0, Pendentes: 0, Canceladas: 0 };
        g.Total++;
        if (r.status === "confirmada") g.Confirmadas++;
        else if (r.status === "pendente") g.Pendentes++;
        else if (r.status === "cancelada") g.Canceladas++;
        porProf.set(k, g);
      }
      const resumo = [...porProf.values()].sort((a, b) => a.Professor.localeCompare(b.Professor, "pt-BR"));
      resumo.push({
        Professor: "TOTAL",
        Total: resumo.reduce((s, g) => s + g.Total, 0),
        Confirmadas: resumo.reduce((s, g) => s + g.Confirmadas, 0),
        Pendentes: resumo.reduce((s, g) => s + g.Pendentes, 0),
        Canceladas: resumo.reduce((s, g) => s + g.Canceladas, 0),
      });

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(detalhe.length ? detalhe : [{ Professor: "Nenhuma reserva no período" }]);
      ws1["!cols"] = [28, 11, 6, 6, 8, 24, 40, 12, 10, 30, 18].map((w) => ({ wch: w }));
      const ws2 = XLSX.utils.json_to_sheet(resumo);
      ws2["!cols"] = [28, 8, 12, 10, 11].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws1, "Reservas");
      XLSX.utils.book_append_sheet(wb, ws2, "Resumo por professor");
      XLSX.writeFile(wb, "reservas_por_professor" + sufixo + ".xlsx");
      toast({ title: "Excel gerado", description: linhas.length + " reserva(s) no período." });
    } catch (err) { falhou(err); } finally { setGerando(null); }
  };

  return (
    <>
      <Button data-testid="button-reservation-report" variant="outline" onClick={() => setAberto(true)}>
        <FileBarChart className="mr-2 h-4 w-4" /> Relatório
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Relatório de reservas por professor</DialogTitle>
            <DialogDescription>Inclui todas as reservas do período: confirmadas, pendentes e canceladas.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rel-inicio">De</Label>
              <Input id="rel-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-fim">Até</Label>
              <Input id="rel-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {!periodoValido && <p className="text-xs text-destructive">A data inicial precisa ser anterior ou igual à final.</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={baixarExcel} disabled={!periodoValido || gerando !== null}>
              {gerando === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Baixar Excel
            </Button>
            <Button onClick={baixarPdf} disabled={!periodoValido || gerando !== null}>
              {gerando === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
