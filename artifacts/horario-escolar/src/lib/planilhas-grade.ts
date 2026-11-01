// [PLANILHAS-FORMATADAS] (31/10/2026) A planilha da grade (Imprimir Grade) e o Controle de Ponto do mês
// (Relatórios Pedagógicos) saíam em CSV, sem o cabeçalho da escola e sem formatação. Agora a tela busca
// os dados em JSON e monta o Excel no mesmo padrão dos outros relatórios (lib/planilha.ts).
import { customFetch } from "@workspace/api-client-react";
import { baixarExcel, type Aba, type Valor } from "@/lib/planilha";

const ORDEM_TURNO = ["matutino", "vespertino", "noturno", "integral"];
const ROTULO_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite", integral: "Integral" };
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });
const posTurno = (t: string) => { const i = ORDEM_TURNO.indexOf(t); return i < 0 ? 99 : i; };
const hoje = () => new Date().toLocaleDateString("pt-BR");

type LinhaGrade = { turma: string; disciplina: string; professor: string; sala: string; diaSemana: number; numeroAula: number; turno: string };

/** Grade oficial: uma aba com a lista de todas as aulas e uma aba por turma no formato de quadro. */
export async function excelDaGrade(turmaId?: string) {
  const qs = new URLSearchParams({ formato: "json" });
  if (turmaId) qs.set("turmaId", turmaId);
  const dados = await customFetch<LinhaGrade[]>(`/api/export/grade?${qs}`);
  const linhas = [...dados].sort((a, b) => posTurno(a.turno) - posTurno(b.turno) || porNome(a.turma, b.turma)
    || a.diaSemana - b.diaSemana || a.numeroAula - b.numeroAula);
  const turmas = [...new Set(linhas.map((l) => l.turma))];
  const umaTurma = turmaId && turmas.length === 1 ? turmas[0] : null;

  const abas: Aba[] = [{
    nome: "Lista",
    titulo: umaTurma ? `Grade horária — ${umaTurma}` : "Grade horária — todas as turmas",
    subtitulo: `Grade oficial em ${hoje()} · ${linhas.length} aula(s) · ${turmas.length} turma(s)`,
    colunas: [
      { titulo: "Turma", largura: 22 }, { titulo: "Turno", largura: 11, tipo: "centro" },
      { titulo: "Dia", largura: 12, tipo: "centro" }, { titulo: "Aula", largura: 7, tipo: "centro" },
      { titulo: "Disciplina", largura: 32 }, { titulo: "Professor", largura: 32 }, { titulo: "Sala", largura: 18 },
    ],
    linhas: linhas.map((l) => [l.turma, ROTULO_TURNO[l.turno] ?? l.turno, DIAS[l.diaSemana] ?? "", l.numeroAula, l.disciplina, l.professor, l.sala]),
    vazio: "Nenhuma aula na grade oficial.",
  }];

  // quadro de cada turma: uma linha por aula, os dias nas colunas (aula compartilhada fica na mesma célula)
  const nomesUsados = new Set(["lista"]);
  for (const turma of turmas) {
    const daTurma = linhas.filter((l) => l.turma === turma);
    const aulas = [...new Set(daTurma.map((l) => l.numeroAula))].sort((a, b) => a - b);
    const celula = (dia: number, aula: number) => daTurma.filter((l) => l.diaSemana === dia && l.numeroAula === aula)
      .map((l) => (l.professor ? `${l.disciplina}\n${l.professor}` : l.disciplina)).join("\n\n");
    let nome = turma.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Turma";
    for (let k = 2; nomesUsados.has(nome.toLowerCase()); k++) nome = `${nome.slice(0, 27)} (${k})`;
    nomesUsados.add(nome.toLowerCase());
    abas.push({
      nome,
      titulo: `Grade horária — ${turma}`,
      subtitulo: `${ROTULO_TURNO[daTurma[0]?.turno ?? ""] ?? ""} · grade oficial em ${hoje()}`,
      colunas: [{ titulo: "Aula", largura: 7, tipo: "centro" }, ...DIAS.map((d) => ({ titulo: d, largura: 28 }))],
      linhas: aulas.map((aula): Valor[] => [`${aula}ª`, ...DIAS.map((_, dia) => celula(dia, aula))]),
      alturaLinha: 34,
      destaque: (valor, coluna) => (coluna > 0 && !valor ? "cinza" : undefined),
    });
  }
  await baixarExcel(abas, umaTurma ? `grade_${umaTurma.replace(/\s+/g, "_")}.xlsx` : "grade_horaria.xlsx");
}

type LinhaPonto = { professor: string; email: string; diaSemana: number; aula: number; disciplina: string; turma: string; turno: string };

/** Controle de Ponto do mês: resumo de aulas por professor e a lista das aulas da semana. */
export async function excelDoPonto(mes: string, ano: string, professorId?: string) {
  const qs = new URLSearchParams({ formato: "json", mes, ano });
  if (professorId) qs.set("professorId", professorId);
  const r = await customFetch<{ mes: number; ano: number; linhas: LinhaPonto[] }>(`/api/export/ponto?${qs}`);
  const linhas = [...r.linhas].sort((a, b) => porNome(a.professor, b.professor) || a.diaSemana - b.diaSemana
    || posTurno(a.turno) - posTurno(b.turno) || a.aula - b.aula);
  const periodo = `${MESES[r.mes - 1] ?? r.mes}/${r.ano}`;
  const porProfessor = new Map<string, number>();
  for (const l of linhas) porProfessor.set(l.professor, (porProfessor.get(l.professor) ?? 0) + 1);
  const resumo: Valor[][] = [...porProfessor].map(([p, n]) => [p, n]);
  if (resumo.length) resumo.push(["Total", linhas.length]);

  await baixarExcel([
    {
      nome: "Resumo",
      titulo: `Controle de Ponto — ${periodo}`,
      subtitulo: `Aulas por semana de cada professor, pela grade oficial em ${hoje()}`,
      colunas: [{ titulo: "Professor", largura: 40 }, { titulo: "Aulas por semana", largura: 18, tipo: "numero" }],
      linhas: resumo,
      total: resumo.length > 0,
      vazio: "Nenhuma aula na grade oficial.",
    },
    {
      nome: "Aulas",
      titulo: `Controle de Ponto — ${periodo} (aulas da semana)`,
      subtitulo: `${linhas.length} aula(s) · ${porProfessor.size} professor(es)`,
      colunas: [
        { titulo: "Professor", largura: 30 }, { titulo: "E-mail", largura: 30 },
        { titulo: "Dia", largura: 12, tipo: "centro" }, { titulo: "Turno", largura: 11, tipo: "centro" },
        { titulo: "Aula", largura: 7, tipo: "centro" }, { titulo: "Disciplina", largura: 30 }, { titulo: "Turma", largura: 20 },
      ],
      linhas: linhas.map((l) => [l.professor, l.email, DIAS[l.diaSemana] ?? "", ROTULO_TURNO[l.turno] ?? l.turno, l.aula, l.disciplina, l.turma]),
      vazio: "Nenhuma aula na grade oficial.",
    },
  ], `controle_ponto_${r.mes}_${r.ano}.xlsx`);
}
