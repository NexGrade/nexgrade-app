// [PRESENCA-PEDAGOGIA] (28/10/2026) Tipos e chamadas da lista de presenca dos professores
// (rotas /api/pedagogia/*) e as planilhas em Excel montadas aqui (formatação em lib/planilha).
import { customFetch, ApiError } from "@workspace/api-client-react";
import { baixarExcel, corDaSituacao, type Valor } from "@/lib/planilha";

export type Status = "presente" | "falta" | "atraso" | "substituido";
export const STATUS: Array<{ valor: Status; curto: string; rotulo: string; cor: string; corAtiva: string }> = [
  { valor: "presente", curto: "P", rotulo: "Presente", cor: "border-emerald-300 text-emerald-700", corAtiva: "bg-emerald-600 text-white border-emerald-600" },
  { valor: "falta", curto: "F", rotulo: "Falta", cor: "border-red-300 text-red-700", corAtiva: "bg-red-600 text-white border-red-600" },
  { valor: "atraso", curto: "A", rotulo: "Atraso", cor: "border-amber-300 text-amber-700", corAtiva: "bg-amber-500 text-white border-amber-500" },
  { valor: "substituido", curto: "S", rotulo: "Substituído", cor: "border-sky-300 text-sky-700", corAtiva: "bg-sky-600 text-white border-sky-600" },
];
export const ROTULO_STATUS: Record<Status, string> = { presente: "Presente", falta: "Falta", atraso: "Atraso", substituido: "Substituído" };

export type Marca = { status: Status; substitutoId: number | null; substitutoNome: string | null; observacao: string | null };
export type AulaDoDia = { numeroAula: number; hora: string; fim: string; turmas: string; disciplinas: string; sala: string; marca: Marca | null };
export type ProfessorDoDia = { professorId: number; nome: string; licenca: string | null; aulas: AulaDoDia[] };
export type Presenca = {
  data: string; dataBR: string; diaSemana: string; aviso: string | null; turno: string; rotuloTurno: string;
  semTabela: boolean; professores: ProfessorDoDia[]; substitutos: Array<{ id: number; nome: string }>;
};
export type MarcaEnvio = { professorId: number; numeroAula: number; status: Status | null; substitutoId?: number | null; substitutoNome?: string | null; observacao?: string | null };

export type AgoraLinha = { professorId: number; professor: string; turno: string; numeroAula: number; hora: string; fim: string; turmas: string; disciplinas: string; sala: string; status: Status | null };
export type Agora = { data: string; dataBR?: string; diaSemana?: string; hora: string; aviso: string | null; emAula: AgoraLinha[]; proximas: AgoraLinha[]; livres: Array<{ professorId: number; professor: string }> };

export type ResumoMes = {
  mes: number; ano: number; titulo: string; semTabela: boolean;
  resumo: Array<{ professorId: number; professor: string; presente: number; falta: number; atraso: number; substituido: number; substituiu: number; marcadas: number }>;
  detalhes: Array<{ data: string; dataBR: string; turno: string; aula: number; professor: string; situacao: string; substituto: string; observacao: string }>;
};

export const TURNOS = [
  { valor: "matutino", rotulo: "Manhã" },
  { valor: "vespertino", rotulo: "Tarde" },
  { valor: "noturno", rotulo: "Noite" },
];

export function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** turno do momento: ate 12h manha, ate 18h tarde, depois noite */
export function turnoAgora(): string {
  const h = new Date().getHours();
  return h < 12 ? "matutino" : h < 18 ? "vespertino" : "noturno";
}

export function mensagemErro(e: unknown): string | undefined {
  if (e instanceof ApiError && e.data && typeof e.data === "object" && "error" in (e.data as object)) return String((e.data as { error: string }).error);
  return e instanceof Error ? e.message : undefined;
}

export const buscarPresenca = (data: string, turno: string) =>
  customFetch<Presenca>(`/api/pedagogia/presenca?data=${encodeURIComponent(data)}&turno=${encodeURIComponent(turno)}`);
export const salvarPresenca = (data: string, turno: string, marcas: MarcaEnvio[]) =>
  customFetch<{ ok: boolean; gravadas: number; apagadas: number }>("/api/pedagogia/presenca", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, turno, marcas }),
  });
export const buscarAgora = () => customFetch<Agora>("/api/pedagogia/agora");
export const buscarMes = (mes: string, ano: string) => customFetch<ResumoMes>(`/api/pedagogia/presenca/mes?mes=${mes}&ano=${ano}`);

export function excelDoDia(p: Presenca) {
  const nomes = new Map(p.substitutos.map((s) => [s.id, s.nome]));
  const linhas: Valor[][] = [];
  for (const prof of p.professores) for (const a of prof.aulas) {
    const m = a.marca;
    linhas.push([
      prof.nome + (prof.licenca ? ` (${prof.licenca})` : ""), `${a.numeroAula}ª`, a.hora ? `${a.hora}–${a.fim}` : "", a.turmas, a.disciplinas, a.sala,
      m ? ROTULO_STATUS[m.status] : "", m?.status === "substituido" ? (m.substitutoId != null ? nomes.get(m.substitutoId) ?? "" : m.substitutoNome ?? "") : "", m?.observacao ?? "",
    ]);
  }
  return baixarExcel([{
    nome: "Presença",
    titulo: "Presença dos professores",
    subtitulo: `${p.rotuloTurno} · ${p.diaSemana}, ${p.dataBR}`,
    aviso: p.aviso,
    colunas: [
      { titulo: "Professor", largura: 32 }, { titulo: "Aula", largura: 7, tipo: "centro" }, { titulo: "Horário", largura: 13, tipo: "centro" },
      { titulo: "Turma", largura: 14 }, { titulo: "Disciplina", largura: 16 }, { titulo: "Sala", largura: 16 },
      { titulo: "Situação", largura: 13, tipo: "centro" }, { titulo: "Substituto", largura: 24 }, { titulo: "Observação", largura: 32 },
    ],
    linhas,
    vazio: "Nenhum professor com aula neste turno.",
    destaque: (v, c) => (c === 6 ? corDaSituacao(v) : undefined),
  }], `presenca_${p.data}_${p.turno}.xlsx`);
}

export function excelDoMes(r: ResumoMes) {
  const resumo: Valor[][] = r.resumo.map((x) => [x.professor, x.presente, x.falta, x.atraso, x.substituido, x.substituiu, x.marcadas]);
  if (resumo.length) resumo.push(["TOTAL", ...[1, 2, 3, 4, 5, 6].map((i) => resumo.reduce((s, l) => s + Number(l[i] ?? 0), 0))]);
  const num = (titulo: string, largura: number) => ({ titulo, largura, tipo: "numero" as const });
  return baixarExcel([
    {
      nome: "Resumo",
      titulo: "Presença dos professores · resumo do mês",
      subtitulo: r.titulo,
      colunas: [{ titulo: "Professor", largura: 34 }, num("Presente", 10), num("Falta", 9), num("Atraso", 9), num("Substituído", 12), num("Substituiu", 11), num("Aulas marcadas", 12)],
      linhas: resumo,
      total: resumo.length > 0,
      vazio: "Nenhuma presença marcada neste mês.",
      destaque: (v, c) => (Number(v) > 0 ? ([undefined, "verde", "vermelho", "ambar", "azul"] as const)[c] : undefined),
    },
    {
      nome: "Ocorrências",
      titulo: "Presença dos professores · ocorrências do mês",
      subtitulo: r.titulo,
      colunas: [
        { titulo: "Data", largura: 11, tipo: "centro" }, { titulo: "Turno", largura: 9, tipo: "centro" }, { titulo: "Aula", largura: 7, tipo: "centro" },
        { titulo: "Professor", largura: 32 }, { titulo: "Situação", largura: 13, tipo: "centro" }, { titulo: "Substituto", largura: 26 }, { titulo: "Observação", largura: 34 },
      ],
      linhas: r.detalhes.map((d) => [d.dataBR, d.turno, `${d.aula}ª`, d.professor, d.situacao, d.substituto, d.observacao]),
      vazio: "Nenhuma ocorrência neste mês.",
      destaque: (v, c) => (c === 4 ? corDaSituacao(v) : undefined),
    },
  ], `faltas_professores_${r.mes}_${r.ano}.xlsx`);
}
