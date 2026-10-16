// [ASS-SO-TURMA] (15/10/2026, Romario 3STM) Aula assincrona colocada num periodo NAO LETIVO
// que fica DEPOIS da ultima aula letiva do turno (ex.: 7a aula da manha, 12:45-13:35) e
// "aula so da turma": aparece no horario da turma (tela, PDF por turma, RCO) e NAO no do
// professor -- ele cumpre esse tempo na escola em outro horario, marcado como
// "Atividade fora de sala (ocupado: ASS)". Periodo nao letivo ANTES das aulas (ex.: 18:00 do
// noturno) continua com a regra antiga (assincrona = tempo do professor).
import { db, horarioSlotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type EhAssSoTurma = (
  s: { assincrona?: boolean | null; numeroAula: number },
  turma: { turno: string; nivelEnsino?: string | null } | undefined,
) => boolean;

export async function carregarAssSoTurma(escolaId: string): Promise<EhAssSoTurma> {
  const slots = await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));
  const chave = (turno: string, nivel: string | null | undefined) => `${turno}|${turno === "matutino" ? nivel ?? "" : ""}`;
  const ultimaLetiva = new Map<string, number>();
  const naoLetivos = new Map<string, Set<number>>();
  for (const s of slots) {
    const k = chave(s.turno, s.nivelEnsino);
    if (s.letivo) ultimaLetiva.set(k, Math.max(ultimaLetiva.get(k) ?? 0, s.numeroAula));
    else {
      if (!naoLetivos.has(k)) naoLetivos.set(k, new Set());
      naoLetivos.get(k)!.add(s.numeroAula);
    }
  }
  return (s, turma) => {
    if (!s.assincrona || !turma) return false;
    const k = chave(turma.turno, turma.nivelEnsino);
    const ult = ultimaLetiva.get(k);
    return ult != null && s.numeroAula > ult && !!naoLetivos.get(k)?.has(s.numeroAula);
  };
}

/** Linhas da grade (numero da aula -> hora) sem os periodos nao letivos do fim que nao tem aula no bloco. */
export async function carregarPeriodosExtrasFinais(escolaId: string): Promise<(turno: string, nivelEnsino: string | null | undefined) => Set<number>> {
  const slots = await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));
  return (turno, nivelEnsino) => {
    const doTurno = slots.filter((s) => s.turno === turno && (turno !== "matutino" || !nivelEnsino || s.nivelEnsino === nivelEnsino));
    const ult = Math.max(0, ...doTurno.filter((s) => s.letivo).map((s) => s.numeroAula));
    return new Set(doTurno.filter((s) => !s.letivo && s.numeroAula > ult).map((s) => s.numeroAula));
  };
}

export function podarLinhasExtras(
  horariosPorAula: Record<number, string>,
  extras: Set<number>,
  usados: Array<{ numeroAula: number }>,
): Record<number, string> {
  if (!extras.size) return horariosPorAula;
  const ocupados = new Set(usados.map((u) => u.numeroAula));
  const r: Record<number, string> = {};
  for (const [k, v] of Object.entries(horariosPorAula)) {
    const n = Number(k);
    if (extras.has(n) && !ocupados.has(n)) continue;
    r[n] = v;
  }
  return r;
}
