// [MENU-UNICO] (28/10/2026) Relatórios Pedagógicos: o que a pedagogia acompanha (ponto e carga
// horária). Antes estes cartões ficavam em Exportar Dados, misturados com o RCO e as planilhas.
import { useState } from "react";
import { useListProfessores } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ClipboardList, Download, FileText, Loader2, NotebookPen, TrendingUp } from "lucide-react";
import { CardPontoDiario } from "@/components/ponto-diario"; // [PONTO-DIARIO]
import { useBaixarArquivo, montarUrl, SEMANA_ATUAL, SEMANA_PROXIMA } from "@/hooks/use-baixar-arquivo";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function RelatoriosPedagogicosPage() {
  const { data: professores = [] } = useListProfessores();
  const { baixar, baixando } = useBaixarArquivo();
  const [pontoOpts, setPontoOpts] = useState({
    professorId: "",
    mes: String(new Date().getMonth() + 1),
    ano: String(new Date().getFullYear()),
  });
  const [cargaOpts, setCargaOpts] = useState({ professorId: "", semana: SEMANA_ATUAL });
  const [anoCumprida, setAnoCumprida] = useState(String(new Date().getFullYear()));
  const anos = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  const Botao = ({ chave, texto, onClick }: { chave: string; texto: string; onClick: () => void }) => (
    <Button className="w-full" disabled={baixando[chave]} onClick={onClick}>
      {baixando[chave] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
      {baixando[chave] ? "Gerando..." : texto}
    </Button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><NotebookPen className="w-6 h-6" /> Relatórios Pedagógicos</h1>
        <p className="text-muted-foreground text-sm">Ponto dos professores e carga horária. Os PDFs da grade ficam em Imprimir Grade.</p>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ponto</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardPontoDiario />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4" /> Controle de Ponto (mês)</CardTitle>
            <CardDescription>Planilha do mês com a carga horária de cada professor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Professor (opcional)</Label>
              <Select value={pontoOpts.professorId} onValueChange={(v) => setPontoOpts((o) => ({ ...o, professorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Todos os professores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os professores</SelectItem>
                  {professores.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={pontoOpts.mes} onValueChange={(v) => setPontoOpts((o) => ({ ...o, mes: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Select value={pontoOpts.ano} onValueChange={(v) => setPontoOpts((o) => ({ ...o, ano: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{anos.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Botao chave="ponto" texto="Baixar Controle de Ponto" onClick={() => baixar(
              montarUrl("/api/export/ponto", { professorId: pontoOpts.professorId || undefined, mes: pontoOpts.mes, ano: pontoOpts.ano }),
              `ponto_professores_${pontoOpts.mes}_${pontoOpts.ano}.csv`, "ponto")} />
          </CardContent>
        </Card>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Carga horária</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="w-4 h-4" /> Carga Horária por Professor</CardTitle>
            <CardDescription>PDF por professor: total de aulas, Hora-Atividade e as turmas e disciplinas de cada turno (o resumo, não a grade do dia a dia).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Professor (opcional)</Label>
              <Select value={cargaOpts.professorId} onValueChange={(v) => setCargaOpts((o) => ({ ...o, professorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Todos os professores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os professores</SelectItem>
                  {professores.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Semana (data no cabeçalho)</Label>
              <Select value={cargaOpts.semana} onValueChange={(v) => setCargaOpts((o) => ({ ...o, semana: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEMANA_ATUAL}>Semana atual</SelectItem>
                  <SelectItem value={SEMANA_PROXIMA}>Semana que vem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Botao chave="carga" texto="Baixar Carga Horária" onClick={() => {
              const nome = cargaOpts.professorId ? `_${professores.find((p) => String(p.id) === cargaOpts.professorId)?.nome ?? cargaOpts.professorId}` : "";
              baixar(
                montarUrl("/api/export/relatorio-carga-pdf", { professorId: cargaOpts.professorId || undefined, semana: cargaOpts.semana === SEMANA_PROXIMA ? SEMANA_PROXIMA : undefined }),
                `relatorio_carga_professores${nome}${cargaOpts.semana === SEMANA_PROXIMA ? "_proxima_semana" : ""}.pdf`, "carga");
            }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-4 h-4" /> Carga Horária Cumprida × Exigida</CardTitle>
            <CardDescription>PDF por turma: quanto de cada disciplina já foi cumprido no ano e o total exigido. Mostra com antecedência se alguma vai fechar o ano devendo aula.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 w-40">
              <Label>Ano letivo</Label>
              <Select value={anoCumprida} onValueChange={setAnoCumprida}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={String(new Date().getFullYear())}>{new Date().getFullYear()}</SelectItem></SelectContent>
              </Select>
            </div>
            <Botao chave="cumprida" texto="Baixar Cumprida × Exigida" onClick={() => baixar(
              montarUrl("/api/export/carga-horaria-pdf", { ano: anoCumprida }), `carga_horaria_${anoCumprida}.pdf`, "cumprida")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
