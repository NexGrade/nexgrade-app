// [IMPRIMIR-GRADE] (28/10/2026) Tela so para imprimir a grade: um cartao por modelo de PDF,
// com miniatura de como fica e um botao. Filtros comuns no topo (turno e semana).
// Antes os PDFs da grade ficavam misturados em Exportar Dados com o RCO, o ponto e as reservas.
// [MENU-UNICO] (28/10/2026) e o unico lugar dos PDFs da grade.
// [MENU-CARGOS] (31/10/2026) a planilha da grade (antes em Exportar planilhas) fica no fim desta tela.
import { useState } from "react";
import { useListTurmas, useListProfessores, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Printer, Table } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBaixarArquivo, montarUrl } from "@/hooks/use-baixar-arquivo"; // [MENU-CARGOS]

const TODOS = "todos";
const TURNOS = [
  { value: "matutino", label: "Manhã" },
  { value: "vespertino", label: "Tarde" },
  { value: "noturno", label: "Noite" },
  { value: "integral", label: "Integral (turmas integrais)" },
  { value: TODOS, label: "Todos os turnos (só nos modelos de um por quadro)" },
];

type Modelo = {
  chave: string;
  titulo: string;
  descricao: string;
  rota: "turma" | "professor" | "disciplina";
  modelo?: string;
  filtro?: "turma" | "professor";
  aceitaTodos: boolean; // aceita "todos os turnos"
  miniatura: "turma" | "lado" | "professor" | "compacto" | "quadro" | "disciplina";
};

const MODELOS: Modelo[] = [
  { chave: "turma", titulo: "Por turma", descricao: "Uma turma por quadro, com a sigla da disciplina e o professor.", rota: "turma", filtro: "turma", aceitaTodos: true, miniatura: "turma" },
  { chave: "lado", titulo: "Turmas lado a lado", descricao: "5 turmas por página, em paisagem. Cada aula com o nome da disciplina e o professor.", rota: "turma", modelo: "lado-a-lado", aceitaTodos: false, miniatura: "lado" },
  { chave: "professor", titulo: "Por professor", descricao: "Um professor por quadro, com turma, disciplina, HA e horários bloqueados.", rota: "professor", filtro: "professor", aceitaTodos: true, miniatura: "professor" },
  { chave: "compacto", titulo: "Professores compacto", descricao: "6 professores por linha: a turma em cada aula, HA em amarelo.", rota: "professor", modelo: "compacto", aceitaTodos: false, miniatura: "compacto" },
  { chave: "quadro", titulo: "Quadro geral de professores", descricao: "Uma linha por professor, com os dias e as aulas nas colunas. Para afixar na sala dos professores.", rota: "professor", modelo: "quadro", aceitaTodos: false, miniatura: "quadro" },
  { chave: "disciplina", titulo: "Por disciplina", descricao: "Um quadro por disciplina: em que turma, horário e com qual professor ela acontece.", rota: "disciplina", aceitaTodos: false, miniatura: "disciplina" },
];

function Miniatura({ tipo }: { tipo: Modelo["miniatura"] }) {
  const azul = "#1565C0", claro = "#E3F2FD", borda = "#cfd8dc";
  const grade = (x: number, y: number, w: number, h: number, cols: number, rows: number, marcadas: number[] = []) => {
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      out.push(<rect key={`${x}-${y}-${i}`} x={x + (c * w) / cols} y={y + (r * h) / rows} width={w / cols} height={h / rows} fill={marcadas.includes(i) ? "#FFF59D" : i % 3 === 0 ? claro : "white"} stroke={borda} strokeWidth={0.5} />);
    }
    return out;
  };
  return (
    <svg viewBox="0 0 120 80" className="w-full h-24 rounded border bg-white" aria-hidden>
      <rect x={0} y={0} width={120} height={10} fill={azul} />
      {tipo === "turma" && <>{grade(4, 16, 54, 26, 5, 5)}{grade(62, 16, 54, 26, 5, 5)}{grade(4, 48, 54, 26, 5, 5)}{grade(62, 48, 54, 26, 5, 5)}</>}
      {tipo === "lado" && <>{[0, 1, 2, 3, 4].map((k) => <rect key={k} x={14 + k * 21} y={14} width={20} height={5} fill={azul} />)}{grade(14, 20, 105, 56, 5, 10)}<rect x={4} y={20} width={9} height={56} fill={claro} stroke={borda} strokeWidth={0.5} /></>}
      {tipo === "professor" && <>{grade(4, 16, 54, 26, 5, 5, [7])}{grade(62, 16, 54, 26, 5, 5, [3])}{grade(4, 48, 54, 26, 5, 5, [12])}{grade(62, 48, 54, 26, 5, 5, [18])}</>}
      {tipo === "compacto" && <>{[0, 1, 2, 3, 4, 5].map((k) => grade(3 + k * 19.5, 16, 18, 24, 5, 6, [k + 6]))}{[0, 1, 2, 3, 4, 5].map((k) => grade(3 + k * 19.5, 46, 18, 24, 5, 6, [k + 11]))}</>}
      {tipo === "quadro" && <><rect x={4} y={14} width={22} height={62} fill={claro} stroke={borda} strokeWidth={0.5} />{grade(27, 14, 90, 62, 15, 12, [20, 47, 90])}</>}
      {tipo === "disciplina" && <>{grade(4, 16, 54, 26, 5, 5)}{grade(62, 16, 54, 26, 5, 5)}{grade(4, 48, 54, 26, 5, 5)}{grade(62, 48, 54, 26, 5, 5)}<text x={4} y={15} fontSize={5} fill={azul}>Matemática</text><text x={62} y={15} fontSize={5} fill={azul}>Português</text></>}
    </svg>
  );
}

// [MENU-CARGOS] grade completa ou de uma turma em CSV, que abre no Excel
function PlanilhaDaGrade({ turmas }: { turmas: Array<{ id: number; nome: string }> }) {
  const { baixar, baixando } = useBaixarArquivo();
  const [turmaId, setTurmaId] = useState(TODOS);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Table className="w-4 h-4" /> Planilha da grade (Excel)</CardTitle>
        <CardDescription>A grade oficial em planilha (CSV, abre no Excel), completa ou de uma turma.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-72">
          <Label>Turma</Label>
          <Select value={turmaId} onValueChange={setTurmaId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as turmas</SelectItem>
              {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={baixando["grade"]} onClick={() => baixar(
          montarUrl("/api/export/grade", { turmaId: turmaId === TODOS ? undefined : turmaId, formato: "csv" }),
          "grade_horaria.csv", "grade")}>
          {baixando["grade"] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {baixando["grade"] ? "Gerando..." : "Baixar planilha"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ImprimirGradePage() {
  const { data: turmas = [] } = useListTurmas();
  const { data: professores = [] } = useListProfessores();
  const { toast } = useToast();
  const [turno, setTurno] = useState("matutino");
  const [semana, setSemana] = useState("atual");
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [baixando, setBaixando] = useState<string | null>(null);

  const baixar = async (m: Modelo) => {
    const url = new URL(`/api/export/grade-pdf/${m.rota}`, window.location.origin);
    if (turno !== TODOS) url.searchParams.set("turno", turno);
    if (semana === "proxima") url.searchParams.set("semana", "proxima");
    if (m.modelo) url.searchParams.set("modelo", m.modelo);
    const f = filtros[m.chave];
    if (f && m.filtro) url.searchParams.set(m.filtro === "turma" ? "turmaId" : "professorId", f);
    setBaixando(m.chave);
    try {
      const blob = await customFetch<Blob>(url.toString(), { responseType: "blob" });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = `grade_${m.chave}${turno !== TODOS ? "_" + turno : ""}${semana === "proxima" ? "_proxima_semana" : ""}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(obj);
    } catch (err) {
      toast({ title: "Não foi possível gerar o PDF", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBaixando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Printer className="w-6 h-6" /> Imprimir Grade</h1>
        <p className="text-muted-foreground text-sm">Escolha o turno e a semana e baixe o modelo de PDF que precisar. Todos usam a grade oficial e saem em folha deitada (paisagem).</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TURNOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Semana (data no cabeçalho)</Label>
            <Select value={semana} onValueChange={setSemana}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="atual">Semana atual</SelectItem>
                <SelectItem value="proxima">Semana que vem</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODELOS.map((m) => {
          const precisaTurno = turno === TODOS && !m.aceitaTodos;
          const semIntegral = turno === "integral" && m.rota !== "turma" ? "No integral, use os modelos por turma: o professor sai no turno real dele (manhã ou tarde)." : null;
          const listaTurmas = turmas.filter((t) => turno === TODOS || t.turno === turno);
          return (
            <Card key={m.chave} className="flex flex-col">
              <CardHeader className="pb-3">
                <Miniatura tipo={m.miniatura} />
                <CardTitle className="text-base pt-2">{m.titulo}</CardTitle>
                <CardDescription>{m.descricao}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                {m.filtro && (
                  <Select value={filtros[m.chave] ?? TODOS} onValueChange={(v) => setFiltros((f) => ({ ...f, [m.chave]: v === TODOS ? "" : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>{m.filtro === "turma" ? "Todas as turmas" : "Todos os professores"}</SelectItem>
                      {m.filtro === "turma"
                        ? listaTurmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)
                        : professores.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {precisaTurno && <p className="text-xs text-amber-700">Escolha um turno para este modelo.</p>}
                {semIntegral && <p className="text-xs text-amber-700">{semIntegral}</p>}
                <Button className="w-full" disabled={precisaTurno || !!semIntegral || baixando !== null} onClick={() => baixar(m)}>
                  {baixando === m.chave ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {baixando === m.chave ? "Gerando..." : "Baixar PDF"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PlanilhaDaGrade turmas={turmas} />
    </div>
  );
}
