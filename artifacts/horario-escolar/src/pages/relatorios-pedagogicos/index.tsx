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
import { ListasPedagogicas } from "@/components/listas-pedagogicas"; // [PEDAGOGIA]
import { Link } from "wouter";
import { Printer, ClipboardCheck, FileSpreadsheet } from "lucide-react";
import { TURNOS, hojeLocal, turnoAgora, buscarPresenca, buscarMes, excelDoDia, excelDoMes, mensagemErro } from "@/lib/presenca"; // [PRESENCA-PEDAGOGIA]
import { useToast } from "@/hooks/use-toast";
import { excelDoPonto } from "@/lib/planilhas-grade"; // [PLANILHAS-FORMATADAS]

const TODOS_PROF = "todos"; // [PLANILHAS-FORMATADAS] o Select nao aceita valor vazio
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function RelatoriosPedagogicosPage() {
  const { data: professores = [] } = useListProfessores();
  const { baixar, baixando } = useBaixarArquivo();
  const [pontoOpts, setPontoOpts] = useState({
    professorId: TODOS_PROF,
    mes: String(new Date().getMonth() + 1),
    ano: String(new Date().getFullYear()),
  });
  const [cargaOpts, setCargaOpts] = useState({ professorId: TODOS_PROF, semana: SEMANA_ATUAL });
  const [anoCumprida, setAnoCumprida] = useState(String(new Date().getFullYear()));
  const anos = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
  // [PRESENCA-PEDAGOGIA] relatorios da lista de presenca
  const { toast } = useToast();
  const [presDia, setPresDia] = useState({ data: hojeLocal(), turno: turnoAgora() });
  const [presMes, setPresMes] = useState({ mes: String(new Date().getMonth() + 1), ano: String(new Date().getFullYear()) });
  const [gerandoExcel, setGerandoExcel] = useState<string | null>(null);
  const excel = async (qual: "dia" | "mes") => {
    setGerandoExcel(qual);
    try {
      if (qual === "dia") await excelDoDia(await buscarPresenca(presDia.data, presDia.turno));
      else await excelDoMes(await buscarMes(presMes.mes, presMes.ano));
    } catch (e) {
      toast({ title: "Não foi possível gerar a planilha", description: mensagemErro(e), variant: "destructive" });
    } finally { setGerandoExcel(null); }
  };
  // [PLANILHAS-FORMATADAS] (31/10/2026) Controle de Ponto em Excel formatado (antes CSV)
  const baixarPonto = async () => {
    setGerandoExcel("ponto");
    try {
      await excelDoPonto(pontoOpts.mes, pontoOpts.ano, pontoOpts.professorId === TODOS_PROF ? undefined : pontoOpts.professorId);
    } catch (e) {
      toast({ title: "Não foi possível gerar a planilha", description: mensagemErro(e), variant: "destructive" });
    } finally { setGerandoExcel(null); }
  };
  const BotaoExcel = ({ qual }: { qual: "dia" | "mes" }) => (
    <Button variant="outline" className="w-full" disabled={gerandoExcel === qual} onClick={() => excel(qual)}>
      {gerandoExcel === qual ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}Excel
    </Button>
  );

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
        <p className="text-muted-foreground text-sm">Presença e ponto dos professores, carga horária e listas de professores e disciplinas.</p>
      </div>

      {/* [PRESENCA-PEDAGOGIA] lista de presenca marcada online */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Presença dos professores</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="w-4 h-4" /> Presença do dia</CardTitle>
            <CardDescription>A lista do dia como foi marcada (situação de cada aula, substituto e observação). Para marcar, use <Link href="/presenca" className="underline">Presença dos professores</Link>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia</Label>
                <input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={presDia.data} onChange={(e) => setPresDia((o) => ({ ...o, data: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Turno</Label>
                <Select value={presDia.turno} onValueChange={(v) => setPresDia((o) => ({ ...o, turno: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TURNOS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Botao chave="pres-dia" texto="PDF" onClick={() => baixar(montarUrl("/api/pedagogia/presenca/pdf", { data: presDia.data, turno: presDia.turno }), `presenca_${presDia.data}_${presDia.turno}.pdf`, "pres-dia")} />
              <BotaoExcel qual="dia" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="w-4 h-4" /> Faltas do mês por professor</CardTitle>
            <CardDescription>Total de presenças, faltas, atrasos e substituições de cada professor no mês, e a lista das ocorrências.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={presMes.mes} onValueChange={(v) => setPresMes((o) => ({ ...o, mes: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Select value={presMes.ano} onValueChange={(v) => setPresMes((o) => ({ ...o, ano: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{anos.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Botao chave="pres-mes" texto="PDF" onClick={() => baixar(montarUrl("/api/pedagogia/presenca/mes", { mes: presMes.mes, ano: presMes.ano, formato: "pdf" }), `faltas_professores_${presMes.mes}_${presMes.ano}.pdf`, "pres-mes")} />
              <BotaoExcel qual="mes" />
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ponto (folha para assinar)</h2>
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
                  <SelectItem value={TODOS_PROF}>Todos os professores</SelectItem>
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
            <Button className="w-full" disabled={gerandoExcel === "ponto"} onClick={() => void baixarPonto()}>
              {gerandoExcel === "ponto" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
              {gerandoExcel === "ponto" ? "Gerando..." : "Baixar Controle de Ponto (Excel)"}
            </Button>
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
                  <SelectItem value={TODOS_PROF}>Todos os professores</SelectItem>
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
              const nome = cargaOpts.professorId !== TODOS_PROF ? `_${professores.find((p) => String(p.id) === cargaOpts.professorId)?.nome ?? cargaOpts.professorId}` : "";
              baixar(
                montarUrl("/api/export/relatorio-carga-pdf", { professorId: cargaOpts.professorId === TODOS_PROF ? undefined : cargaOpts.professorId, semana: cargaOpts.semana === SEMANA_PROXIMA ? SEMANA_PROXIMA : undefined }),
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

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Listas e grade</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ListasPedagogicas />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Printer className="w-4 h-4" /> Grade do professor</CardTitle>
            <CardDescription>Por professor, professores compacto ou quadro geral para a sala dos professores, em Imprimir Grade.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full"><Link href="/imprimir-grade"><Printer className="w-4 h-4 mr-2" />Abrir Imprimir Grade</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
