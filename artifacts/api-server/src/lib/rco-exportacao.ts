// [ARQUIVO-RCO] (26/10/2026) Leitura do arquivo de exportacao da tela Grade de Horario do RCO
// (SEED-PR). O RCO gera esse XML com o cadastro OFICIAL da escola no SERE (o rotulo da raiz e de
// um sistema de terceiros, mas o conteudo e da escola/SEED). Tres partes:
//   DISCIPLINAS: CODIGO (Codigo Externo do RCO), NOME (como o RCO escreve), ABREVIATURA (SAE quando numero)
//   TURMAS:      CODIGO (codigo SERE), NOME curso_serie_turno_letra, ABREVIATURA, DIAS (2=seg..6=sex),
//                AULAS (por dia), TURNO (M, T, N, MT = integral), COD_TURMA_IF (parte IF do 3o ano)
//   GRADES:      COD_TURMA x COD_DISCIPLINA x AULAS (matriz oficial da turma, aulas por semana)
// Funcao pura (testada). Nao usa parser de XML: o arquivo e plano, so com tags simples.

export type DisciplinaRco = { codigo: number; nome: string; sae: string | null; abreviatura: string };
export type TurmaRco = {
  codigo: number; nome: string; abreviatura: string; curso: string | null; serie: string | null; letra: string | null;
  dias: number[]; aulasPorDia: number | null; turno: string; codigoIf: number | null;
};
export type GradeRco = { codTurma: number; codDisciplina: number; aulas: number };
export type ExportacaoRco = { disciplinas: DisciplinaRco[]; turmas: TurmaRco[]; grades: GradeRco[] };
export type ResumoExportacaoRco = {
  disciplinas: number; turmas: number; linhasGrade: number;
  turmasPorTurno: Record<string, number>; turmasComParteIf: number; cursos: number;
};

const TURNO_LEGIVEL: Record<string, string> = { M: "manha", T: "tarde", N: "noite", MT: "integral" };

function secao(xml: string, nome: string): string | null {
  const i = xml.indexOf(`<${nome}>`);
  const f = xml.indexOf(`</${nome}>`);
  return i >= 0 && f > i ? xml.slice(i, f) : null;
}
function registros(trecho: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const m of trecho.matchAll(/<REGISTRO>([\s\S]*?)<\/REGISTRO>/g)) {
    const r: Record<string, string> = {};
    for (const c of m[1]!.matchAll(/<([A-Z_0-9]+)>([^<]*)<\/\1>/g)) r[c[1]!] = c[2]!.trim();
    out.push(r);
  }
  return out;
}
const num = (s: string | undefined): number | null => (s && /^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/** Le o arquivo. Devolve null se nao for o arquivo de exportacao da Grade de Horario do RCO. */
export function lerExportacaoRco(xml: string): ExportacaoRco | null {
  const sd = secao(xml, "DISCIPLINAS"), st = secao(xml, "TURMAS"), sg = secao(xml, "GRADES");
  if (!sd || !st || !sg) return null;
  const disciplinas = registros(sd).flatMap((r) => {
    const codigo = num(r.CODIGO);
    if (codigo == null || !r.NOME) return [];
    const ab = (r.ABREVIATURA ?? "").trim();
    return [{ codigo, nome: r.NOME, abreviatura: ab, sae: /^\d+$/.test(ab) ? ab : null }];
  });
  const turmas = registros(st).flatMap((r) => {
    const codigo = num(r.CODIGO);
    if (codigo == null) return [];
    const partes = (r.NOME ?? "").split("_");
    return [{
      codigo, nome: r.NOME ?? "", abreviatura: r.ABREVIATURA ?? "",
      curso: partes[0] ?? null, serie: partes[1] ?? null, letra: partes[3] ?? null,
      dias: (r.DIAS ?? "").split("").map(Number).filter((d) => d >= 2 && d <= 7),
      aulasPorDia: num(r.AULAS), turno: r.TURNO ?? "", codigoIf: num(r.COD_TURMA_IF),
    }];
  });
  const grades = registros(sg).flatMap((r) => {
    const codTurma = num(r.COD_TURMA), codDisciplina = num(r.COD_DISCIPLINA), aulas = num(r.AULAS);
    return codTurma != null && codDisciplina != null && aulas != null ? [{ codTurma, codDisciplina, aulas }] : [];
  });
  if (!disciplinas.length || !turmas.length) return null;
  return { disciplinas, turmas, grades };
}

export function resumirExportacaoRco(e: ExportacaoRco): ResumoExportacaoRco {
  const turmasPorTurno: Record<string, number> = {};
  for (const t of e.turmas) {
    const k = TURNO_LEGIVEL[t.turno] ?? (t.turno || "sem turno");
    turmasPorTurno[k] = (turmasPorTurno[k] ?? 0) + 1;
  }
  return {
    disciplinas: e.disciplinas.length, turmas: e.turmas.length, linhasGrade: e.grades.length,
    turmasPorTurno, turmasComParteIf: e.turmas.filter((t) => t.codigoIf != null).length,
    cursos: new Set(e.turmas.map((t) => t.curso).filter(Boolean)).size,
  };
}
