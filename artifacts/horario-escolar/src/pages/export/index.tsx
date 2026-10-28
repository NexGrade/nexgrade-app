// [MENU-UNICO] (28/10/2026) Exportar planilhas: so os dados em planilha (CSV/JSON).
// Cada relatorio fica num lugar so: PDFs da grade em Imprimir Grade, ponto e carga horaria em
// Relatorios Pedagogicos, XML em Exportar para o RCO e o relatorio de reservas na tela Reservas.
import { useState } from "react";
import { useListTurmas } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, Table, Loader2, Printer, NotebookPen, BarChart3, DoorOpen } from "lucide-react";
import { Link } from "wouter";
import { useBaixarArquivo, montarUrl } from "@/hooks/use-baixar-arquivo";

const ONDE_FICOU = [
  { href: "/imprimir-grade", icone: Printer, titulo: "Imprimir Grade", texto: "PDFs da grade: por turma, por professor e os outros modelos" },
  { href: "/relatorios-pedagogicos", icone: NotebookPen, titulo: "Relatórios Pedagógicos", texto: "Ponto do dia, controle de ponto e carga horária" },
  { href: "/rco", icone: BarChart3, titulo: "Exportar para o RCO", texto: "Arquivo XML da grade para o RCO" },
  { href: "/reservas", icone: DoorOpen, titulo: "Reservas", texto: "Relatório de reservas (botão na própria tela)" },
];

export default function ExportPage() {
  const { data: turmas = [] } = useListTurmas();
  const { baixar, baixando } = useBaixarArquivo();
  const [gradeOpts, setGradeOpts] = useState({ turmaId: "", formato: "csv" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Table className="w-6 h-6" /> Exportar planilhas</h1>
        <p className="text-muted-foreground text-sm">A grade em planilha (CSV para o Excel) ou em JSON.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Table className="w-4 h-4" /> Grade Horária</CardTitle>
            <CardDescription>A grade completa ou de uma turma, em CSV ou JSON.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Turma (opcional)</Label>
              <Select value={gradeOpts.turmaId} onValueChange={(v) => setGradeOpts((o) => ({ ...o, turmaId: v }))}>
                <SelectTrigger><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as turmas</SelectItem>
                  {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Select value={gradeOpts.formato} onValueChange={(v) => setGradeOpts((o) => ({ ...o, formato: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Excel)</SelectItem>
                  <SelectItem value="json">JSON (API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={baixando["grade"]} onClick={() => baixar(
              montarUrl("/api/export/grade", { turmaId: gradeOpts.turmaId || undefined, formato: gradeOpts.formato }),
              `grade_horaria.${gradeOpts.formato === "json" ? "json" : "csv"}`, "grade")}>
              {baixando["grade"] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {baixando["grade"] ? "Gerando..." : "Baixar Grade Horária"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Onde ficou cada coisa</CardTitle>
            <CardDescription>Cada relatório agora fica num lugar só.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ONDE_FICOU.map(({ href, icone: Icone, titulo, texto }) => (
              <Link key={href} href={href} className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/60 transition-colors">
                <Icone className="w-4 h-4 mt-0.5 text-[#1565C0]" />
                <span><span className="font-medium block text-sm">{titulo}</span><span className="text-xs text-muted-foreground">{texto}</span></span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
