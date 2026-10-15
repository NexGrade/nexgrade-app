// [CALENDARIO-OFICIAL] (15/10/2026) Calendario letivo oficial da SEED-PR, usado para
// padronizar o calendario das escolas (botao na tela Calendario, escola nova e script).
// 2026: o mesmo calendario ja usado no Mario Braga e no Romario (35 datas: feriados,
// Carnaval, recessos entre trimestres e de julho).
// A escola pode ajustar depois (recesso, feriado municipal, reposicao) na propria tela.
import { db, calendarioEscolarTable, trimestresLetivosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type TrimestreOficial = { trimestre: number; dataInicio: string; dataFim: string; diasLetivos: number };
export type EventoOficial = { data: string; tipo: string; descricao: string; diaLetivo: boolean };
export type CalendarioOficial = { ano: number; fonte: string; trimestres: TrimestreOficial[]; eventos: EventoOficial[] };

const ev = (data: string, tipo: string, descricao: string, diaLetivo = false): EventoOficial => ({ data, tipo, descricao, diaLetivo });

export const CALENDARIOS_OFICIAIS: Record<number, CalendarioOficial> = {
  2026: {
    ano: 2026,
    fonte: "SEED-PR, Resolução nº 6.494/2025 (rede estadual), com recessos e feriados",
    trimestres: [
      { trimestre: 1, dataInicio: "2026-02-05", dataFim: "2026-05-14", diasLetivos: 63 },
      { trimestre: 2, dataInicio: "2026-05-18", dataFim: "2026-09-04", diasLetivos: 68 },
      { trimestre: 3, dataInicio: "2026-09-08", dataFim: "2026-12-18", diasLetivos: 70 },
    ],
    eventos: [
      ev("2026-01-01", "feriado", "Confraternização Universal"),
      ev("2026-02-05", "inicio_trimestre", "Início do 1º Trimestre", true),
      ev("2026-02-16", "feriado", "Carnaval"),
      ev("2026-02-17", "feriado", "Carnaval"),
      ev("2026-04-03", "feriado", "Sexta-feira Santa"),
      ev("2026-04-21", "feriado", "Tiradentes"),
      ev("2026-05-01", "feriado", "Dia do Trabalho"),
      ev("2026-05-14", "fim_trimestre", "Fim do 1º Trimestre", true),
      ev("2026-05-15", "recesso", "Recesso entre 1º e 2º Trimestre"),
      ev("2026-05-16", "recesso", "Recesso entre 1º e 2º Trimestre"),
      ev("2026-05-17", "recesso", "Recesso entre 1º e 2º Trimestre"),
      ev("2026-05-18", "inicio_trimestre", "Início do 2º Trimestre", true),
      ev("2026-06-04", "feriado", "Corpus Christi"),
      ev("2026-07-13", "recesso", "Recesso Escolar"),
      ev("2026-07-14", "recesso", "Recesso Escolar"),
      ev("2026-07-15", "recesso", "Recesso Escolar"),
      ev("2026-07-16", "recesso", "Recesso Escolar"),
      ev("2026-07-17", "recesso", "Recesso Escolar"),
      ev("2026-07-18", "recesso", "Recesso Escolar"),
      ev("2026-07-19", "recesso", "Recesso Escolar"),
      ev("2026-07-20", "recesso", "Recesso Escolar"),
      ev("2026-07-21", "recesso", "Recesso Escolar"),
      ev("2026-07-22", "recesso", "Recesso Escolar"),
      ev("2026-09-04", "fim_trimestre", "Fim do 2º Trimestre", true),
      ev("2026-09-05", "recesso", "Recesso entre 2º e 3º Trimestre"),
      ev("2026-09-06", "recesso", "Recesso entre 2º e 3º Trimestre"),
      ev("2026-09-07", "recesso", "Recesso entre 2º e 3º Trimestre"),
      ev("2026-09-07", "feriado", "Independência do Brasil"),
      ev("2026-09-08", "inicio_trimestre", "Início do 3º Trimestre", true),
      ev("2026-10-12", "feriado", "Nossa Senhora Aparecida"),
      ev("2026-11-02", "feriado", "Finados"),
      ev("2026-11-15", "feriado", "Proclamação da República"),
      ev("2026-11-20", "feriado", "Consciência Negra"),
      ev("2026-12-18", "fim_trimestre", "Fim do 3º Trimestre", true),
      ev("2026-12-25", "feriado", "Natal"),
    ],
  },
};

export const TIPOS_EVENTO = [
  "feriado", "recesso", "ponto_facultativo", "estudo_planejamento",
  "inicio_ano_letivo", "fim_ano_letivo", "inicio_trimestre", "fim_trimestre", "reposicao",
] as const;

type Executor = Pick<typeof db, "delete" | "insert" | "select">;

/** Troca o calendario do ano da escola pelo oficial (feriados, marcos e trimestres). */
export async function aplicarCalendarioOficial(escolaId: string, ano: number, executor?: Executor) {
  const cal = CALENDARIOS_OFICIAIS[ano];
  if (!cal) throw new Error(`não há calendário oficial cadastrado para ${ano}`);
  const run = async (tx: Executor) => {
    await tx.delete(calendarioEscolarTable).where(and(eq(calendarioEscolarTable.escolaId, escolaId), eq(calendarioEscolarTable.ano, ano)));
    await tx.delete(trimestresLetivosTable).where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano)));
    await tx.insert(trimestresLetivosTable).values(cal.trimestres.map((t) => ({ escolaId, ano, ...t })));
    await tx.insert(calendarioEscolarTable).values(cal.eventos.map((e) => ({ escolaId, ano, ...e })));
  };
  if (executor) await run(executor);
  else await db.transaction(async (tx) => run(tx as unknown as Executor));
  return { trimestres: cal.trimestres.length, eventos: cal.eventos.length, fonte: cal.fonte };
}

/** Confere uma lista de trimestres (1, 2, 3 em ordem, datas validas e sem sobreposicao). */
export function validarTrimestres(ano: number, ts: TrimestreOficial[]): string | null {
  if (ts.length < 1 || ts.length > 4) return "Informe de 1 a 4 trimestres.";
  const ordenados = [...ts].sort((a, b) => a.trimestre - b.trimestre);
  for (let i = 0; i < ordenados.length; i++) {
    const t = ordenados[i];
    if (t.trimestre !== i + 1) return "Os trimestres devem ser numerados 1, 2, 3 em sequência.";
    if (!t.dataInicio.startsWith(String(ano)) || !t.dataFim.startsWith(String(ano))) return `As datas do ${t.trimestre}º trimestre devem estar em ${ano}.`;
    if (t.dataFim < t.dataInicio) return `No ${t.trimestre}º trimestre o fim é antes do início.`;
    if (t.diasLetivos < 1 || t.diasLetivos > 150) return `Dias letivos do ${t.trimestre}º trimestre fora do esperado.`;
    if (i > 0 && t.dataInicio <= ordenados[i - 1].dataFim) return `O ${t.trimestre}º trimestre começa antes do fim do anterior.`;
  }
  return null;
}
