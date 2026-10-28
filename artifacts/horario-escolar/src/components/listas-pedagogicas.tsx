// [PEDAGOGIA] (28/10/2026) Listas para a pedagogia, em Excel: professores (com as aulas por turno)
// e disciplinas (com as turmas e os professores). Montadas aqui com os dados da grade oficial.
import { useState } from "react";
import * as XLSX from "xlsx";
import { useListProfessores, useListDisciplinas, useListTurmas, useListHorarios } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, FileSpreadsheet, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TURNOS = [
  { chave: "matutino", rotulo: "Manhã" },
  { chave: "vespertino", rotulo: "Tarde" },
  { chave: "noturno", rotulo: "Noite" },
  { chave: "integral", rotulo: "Integral" },
];
const ordenar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

function salvarPlanilha(linhas: Record<string, string | number>[], aba: string, arquivo: string) {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const cab = linhas[0] ? Object.keys(linhas[0]) : [];
  ws["!cols"] = cab.map((c) => ({ wch: Math.min(60, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? "").length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba);
  XLSX.writeFile(wb, arquivo);
}

export function ListasPedagogicas() {
  const { toast } = useToast();
  const { data: professores = [], isLoading: l1 } = useListProfessores();
  const { data: disciplinas = [], isLoading: l2 } = useListDisciplinas();
  const { data: turmas = [], isLoading: l3 } = useListTurmas();
  const { data: horarios = [], isLoading: l4 } = useListHorarios();
  const carregando = l1 || l2 || l3 || l4;
  const [gerando, setGerando] = useState<string | null>(null);

  const turnoDaTurma = new Map(turmas.map((t) => [t.id, String(t.turno)]));
  const nomeTurma = new Map(turmas.map((t) => [t.id, t.nome]));
  const nomeDisc = new Map(disciplinas.map((d) => [d.id, d.nome]));
  const nomeProf = new Map(professores.map((p) => [p.id, p.nome]));

  const listaProfessores = () => {
    const linhas = [...professores].sort((a, b) => ordenar(a.nome, b.nome)).map((p) => {
      const aulas = horarios.filter((h) => h.professorId === p.id);
      const porTurno = Object.fromEntries(TURNOS.map((t) => [`Aulas ${t.rotulo}`, aulas.filter((h) => turnoDaTurma.get(h.turmaId) === t.chave).length]));
      const turmasDele = [...new Set(aulas.map((h) => nomeTurma.get(h.turmaId) ?? ""))].filter(Boolean).sort(ordenar);
      return {
        Professor: p.nome,
        "E-mail": p.email ?? "",
        Telefone: p.telefone ?? "",
        Situação: p.ativo ? "Ativo" : "Inativo",
        Disciplinas: (p.disciplinaIds ?? []).map((id) => nomeDisc.get(id) ?? "").filter(Boolean).sort(ordenar).join(", "),
        Turmas: turmasDele.join(", "),
        ...porTurno,
        "Total de aulas": aulas.length,
      };
    });
    salvarPlanilha(linhas, "Professores", `lista_professores_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const listaDisciplinas = () => {
    const linhas = [...disciplinas].sort((a, b) => ordenar(a.nome, b.nome)).map((d) => {
      const aulas = horarios.filter((h) => h.disciplinaId === d.id);
      return {
        Disciplina: d.nome,
        Sigla: d.sigla ?? "",
        "Código Externo (RCO)": (d as { codigoExternoRco?: number | null }).codigoExternoRco ?? "",
        "Aulas por semana (cadastro)": d.cargaSemanal,
        "Aulas na grade": aulas.length,
        Turmas: [...new Set(aulas.map((h) => nomeTurma.get(h.turmaId) ?? ""))].filter(Boolean).sort(ordenar).join(", "),
        Professores: [...new Set(aulas.map((h) => nomeProf.get(h.professorId) ?? ""))].filter(Boolean).sort(ordenar).join(", "),
      };
    });
    salvarPlanilha(linhas, "Disciplinas", `lista_disciplinas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const gerar = (chave: string, fn: () => void) => {
    setGerando(chave);
    try { fn(); } catch (e) {
      toast({ title: "Não foi possível gerar a planilha", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setGerando(null); }
  };

  const Botao = ({ chave, texto, fn }: { chave: string; texto: string; fn: () => void }) => (
    <Button className="w-full" disabled={carregando || gerando !== null} onClick={() => gerar(chave, fn)}>
      {carregando || gerando === chave ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
      {carregando ? "Carregando..." : texto}
    </Button>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4" /> Lista de professores</CardTitle>
          <CardDescription>Excel com e-mail, telefone, disciplinas, turmas e aulas por turno de cada professor (pela grade oficial).</CardDescription>
        </CardHeader>
        <CardContent><Botao chave="prof" texto="Baixar lista de professores" fn={listaProfessores} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="w-4 h-4" /> Lista de disciplinas</CardTitle>
          <CardDescription>Excel com sigla, código do RCO, aulas por semana e as turmas e professores de cada disciplina.</CardDescription>
        </CardHeader>
        <CardContent><Botao chave="disc" texto="Baixar lista de disciplinas" fn={listaDisciplinas} /></CardContent>
      </Card>
    </>
  );
}
