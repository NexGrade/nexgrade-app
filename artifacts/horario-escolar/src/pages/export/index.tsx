import { useState } from "react";
import { useListTurmas, useListProfessores } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, FileText, Table, BarChart3, FileDown, ClipboardList, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function buildUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  return url.toString();
}

// [FIX] "Todos os turnos" usava value="" antes -- o componente Select
// (Radix) reserva string vazia internamente para representar "nada
// selecionado", então um SelectItem com value="" nunca fica marcado
// corretamente e o onValueChange não atualiza o estado como esperado.
// Isso fazia a seleção "não colar" na tela e o PDF sempre sair com o
// último turno de verdade que tinha sido escolhido antes (Vespertino).
// Usamos um valor real ("todos") e convertemos pra undefined só na
// hora de montar a URL da requisição.
const TURNO_TODOS = "todos";
const TURNOS = [
  { value: TURNO_TODOS, label: "Todos os turnos (misturados)" },
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "noturno", label: "Noturno" },
];

// [NOVO] A grade em si nunca muda de uma semana pra outra (é um modelo
// recorrente por dia-da-semana, não por data) -- mas a escola manda o
// PDF pros professores toda semana, e às vezes prepara com
// antecedência pra semana seguinte. Esse seletor só controla a DATA
// impressa no cabeçalho do PDF (ver `intervaloSemana` em
// api-server/src/routes/export.ts), não o conteúdo da grade.
const SEMANA_ATUAL = "atual";
const SEMANA_PROXIMA = "proxima";

export default function ExportPage() {
  const { data: turmas = [] } = useListTurmas();
  const { data: professores = [] } = useListProfessores();
  const { toast } = useToast();
  const [gradeOpts, setGradeOpts] = useState({ turmaId: "", formato: "csv" });
  const [pontoOpts, setPontoOpts] = useState({
    professorId: "",
    mes: String(new Date().getMonth() + 1),
    ano: String(new Date().getFullYear()),
  });
  const [seedEstado, setSeedEstado] = useState("PR");
  const [loadingSeed, setLoadingSeed] = useState(false);
  // [NOVO] "turno" filtra o PDF para só um período por vez -- sem isso,
  // turmas de matutino/vespertino/noturno saem misturadas na mesma
  // sequência de páginas, sem nenhuma ordem lógica.
  // [FIX] valor inicial agora é o sentinel TURNO_TODOS, não "".
  // [NOVO] "semana" controla a data impressa no cabeçalho -- ver
  // comentário acima de SEMANA_ATUAL/SEMANA_PROXIMA.
  const [pdfOpts, setPdfOpts] = useState({ visao: "turma", entidadeId: "", turno: TURNO_TODOS, semana: SEMANA_ATUAL });
  // [NOVO] Relatório de Carga Horária por Professor -- resumo (total de
  // aulas + HA institucional + turmas/disciplinas por período), não a
  // grade dia-a-dia.
  const [cargaOpts, setCargaOpts] = useState({ professorId: "", semana: SEMANA_ATUAL });
  // [NOVO] Carga Horária Cumprida x Exigida virou relatório sob demanda
  // em vez de tela fixa no menu (ver pages/carga-horaria removida) --
  // mesmo dado, mesma consulta, agora em PDF pra consultar quando
  // precisar em vez de ficar ocupando espaço permanente na navegação.
  const [cargaHorariaOpts, setCargaHorariaOpts] = useState({ ano: String(new Date().getFullYear()) });

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: `Download iniciado: ${filename}` });
  };

  const handleSeedDownload = async () => {
    setLoadingSeed(true);
    try {
      const url = buildUrl("/api/export/relatorio-seed", { estado: seedEstado });
      const res = await fetch(url);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const objUrl = URL.createObjectURL(blob);
      handleDownload(objUrl, `relatorio_seed_${seedEstado}_${new Date().getFullYear()}.json`);
      URL.revokeObjectURL(objUrl);
    } catch {
      toast({ title: "Erro ao gerar relatório", variant: "destructive" });
    } finally {
      setLoadingSeed(false);
    }
  };

  const MESES = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Exportar Dados</h1>
        <p className="text-muted-foreground mt-1">Exporte a grade horária, controle de ponto e relatórios SEED.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Horária */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Table className="w-4 h-4" /> Grade Horária
            </CardTitle>
            <CardDescription>Exporta a grade completa ou por turma em CSV ou JSON.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Turma (opcional)</Label>
              <Select value={gradeOpts.turmaId} onValueChange={v => setGradeOpts(o => ({ ...o, turmaId: v }))}>
                <SelectTrigger><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as turmas</SelectItem>
                  {turmas.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Select value={gradeOpts.formato} onValueChange={v => setGradeOpts(o => ({ ...o, formato: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Excel)</SelectItem>
                  <SelectItem value="json">JSON (API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => {
              const url = buildUrl("/api/export/grade", { turmaId: gradeOpts.turmaId || undefined, formato: gradeOpts.formato });
              // [FIX] Antes o nome do arquivo vinha sempre fixo em
              // ".csv", mesmo quando "JSON (API)" estava selecionado --
              // o navegador baixava conteúdo JSON com extensão .csv, e
              // o Excel tentava (e falhava) interpretar como CSV.
              const extensao = gradeOpts.formato === "json" ? "json" : "csv";
              handleDownload(url, `grade_horaria.${extensao}`);
            }}>
              <Download className="w-4 h-4 mr-2" />Baixar Grade Horária
            </Button>
          </CardContent>
        </Card>

        {/* Controle de Ponto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" /> Controle de Ponto
            </CardTitle>
            <CardDescription>Gera planilha de ponto com carga horária dos professores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Professor (opcional)</Label>
              <Select value={pontoOpts.professorId} onValueChange={v => setPontoOpts(o => ({ ...o, professorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Todos os professores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os professores</SelectItem>
                  {professores.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={pontoOpts.mes} onValueChange={v => setPontoOpts(o => ({ ...o, mes: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Select value={pontoOpts.ano} onValueChange={v => setPontoOpts(o => ({ ...o, ano: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={() => {
              const url = buildUrl("/api/export/ponto", {
                professorId: pontoOpts.professorId || undefined,
                mes: pontoOpts.mes,
                ano: pontoOpts.ano,
              });
              handleDownload(url, `ponto_professores_${pontoOpts.mes}_${pontoOpts.ano}.csv`);
            }}>
              <Download className="w-4 h-4 mr-2" />Baixar Controle de Ponto
            </Button>
          </CardContent>
        </Card>

        {/* Grade em PDF */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileDown className="w-4 h-4" /> Grade em PDF
            </CardTitle>
            <CardDescription>Gera um PDF pronto para impressão — visão por turma ou por professor, para conferência da equipe pedagógica antes de homologar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Visão</Label>
              <Select
                value={pdfOpts.visao}
                onValueChange={(v) => setPdfOpts((o) => ({ ...o, visao: v, entidadeId: "" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="turma">Por Turma</SelectItem>
                  <SelectItem value="professor">Por Professor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* [NOVO] Filtro de turno -- evita PDFs gigantes com
                matutino/vespertino/noturno misturados sem ordem. */}
            <div className="space-y-1.5">
              <Label>Turno</Label>
              <Select value={pdfOpts.turno} onValueChange={(v) => setPdfOpts((o) => ({ ...o, turno: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* [NOVO] Data impressa no cabeçalho do PDF -- não muda o
                conteúdo da grade (que é sempre a mesma, recorrente), só
                qual semana aparece escrita no topo. Útil quando o PDF é
                preparado com antecedência pra semana seguinte. */}
            <div className="space-y-1.5">
              <Label>Semana (data no cabeçalho)</Label>
              <Select value={pdfOpts.semana} onValueChange={(v) => setPdfOpts((o) => ({ ...o, semana: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEMANA_ATUAL}>Semana atual</SelectItem>
                  <SelectItem value={SEMANA_PROXIMA}>Semana que vem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{pdfOpts.visao === "turma" ? "Turma (opcional)" : "Professor (opcional)"}</Label>
              <Select value={pdfOpts.entidadeId} onValueChange={(v) => setPdfOpts((o) => ({ ...o, entidadeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={pdfOpts.visao === "turma" ? "Todas as turmas (uma página cada)" : "Todos os professores (uma página cada)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{pdfOpts.visao === "turma" ? "Todas as turmas" : "Todos os professores"}</SelectItem>
                  {pdfOpts.visao === "turma"
                    ? turmas
                        .filter((t) => pdfOpts.turno === TURNO_TODOS || t.turno === pdfOpts.turno)
                        .map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)
                    : professores.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const param = pdfOpts.visao === "turma" ? "turmaId" : "professorId";
                const turnoParaEnviar = pdfOpts.turno === TURNO_TODOS ? undefined : pdfOpts.turno;
                const url = buildUrl(`/api/export/grade-pdf/${pdfOpts.visao}`, {
                  [param]: pdfOpts.entidadeId || undefined,
                  turno: turnoParaEnviar,
                  semana: pdfOpts.semana === SEMANA_PROXIMA ? SEMANA_PROXIMA : undefined,
                });
                const sufixoTurno = turnoParaEnviar ? `_${turnoParaEnviar}` : "";
                const sufixoSemana = pdfOpts.semana === SEMANA_PROXIMA ? "_proxima_semana" : "";
                handleDownload(url, `grade_por_${pdfOpts.visao}${sufixoTurno}${sufixoSemana}.pdf`);
              }}
            >
              <Download className="w-4 h-4 mr-2" />Baixar PDF
            </Button>
          </CardContent>
        </Card>

        {/* Relatório de Carga Horária por Professor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="w-4 h-4" /> Relatório de Carga Horária
            </CardTitle>
            <CardDescription>PDF por professor com o total de aulas, Hora-Atividade institucional e as turmas/disciplinas de cada período (manhã/tarde/noite) — não é a grade dia-a-dia, é o resumo.</CardDescription>
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
            <Button
              className="w-full"
              onClick={() => {
                const url = buildUrl("/api/export/relatorio-carga-pdf", {
                  professorId: cargaOpts.professorId || undefined,
                  semana: cargaOpts.semana === SEMANA_PROXIMA ? SEMANA_PROXIMA : undefined,
                });
                const sufixo = cargaOpts.professorId
                  ? `_${professores.find((p) => String(p.id) === cargaOpts.professorId)?.nome ?? cargaOpts.professorId}`
                  : "";
                const sufixoSemana = cargaOpts.semana === SEMANA_PROXIMA ? "_proxima_semana" : "";
                handleDownload(url, `relatorio_carga_professores${sufixo}${sufixoSemana}.pdf`);
              }}
            >
              <Download className="w-4 h-4 mr-2" />Baixar Relatório de Carga
            </Button>
          </CardContent>
        </Card>

        {/* Carga Horária Cumprida x Exigida */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4" /> Carga Horária Cumprida × Exigida
            </CardTitle>
            <CardDescription>PDF por turma com cada disciplina, quanto já foi cumprido no ano x o total exigido -- pra checar antecipadamente se alguma vai fechar o ano devendo aula.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 w-40">
              <Label>Ano letivo</Label>
              <Select value={cargaHorariaOpts.ano} onValueChange={(v) => setCargaHorariaOpts({ ano: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const url = buildUrl("/api/export/carga-horaria-pdf", { ano: cargaHorariaOpts.ano });
                handleDownload(url, `carga_horaria_${cargaHorariaOpts.ano}.pdf`);
              }}
            >
              <Download className="w-4 h-4 mr-2" />Baixar Carga Horária
            </Button>
          </CardContent>
        </Card>

        {/* Relatório SEED */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4" /> Relatório SEED
            </CardTitle>
            <CardDescription>Exporta o relatório no formato compatível com o sistema SEED do estado selecionado.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="space-y-1.5 w-40">
                <Label>Estado</Label>
                <Select value={seedEstado} onValueChange={setSeedEstado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["SP","MG","RJ","BA","PR","RS","PE","CE","GO","AM"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSeedDownload} disabled={loadingSeed}>
                <Download className="w-4 h-4 mr-2" />
                {loadingSeed ? "Gerando..." : `Baixar Relatório SEED-${seedEstado}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
