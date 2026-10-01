// [HA-CONTRATURNO-ASTERISCO] HA em contraturno = HA num turno em que o
// professor nao tem NENHUMA aula na semana (mesma regra do recalcular-ha.ts,
// "turno onde o professor nao da aula"). Usado para exibir "HA*" nas telas.
// O PDF por professor (routes/export.ts) tem calculo proprio porque precisa
// considerar a semana do experimento na previa.
import { db, horariosTable, turmasTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { getEscolaId } from "./escola-id";

type EscolaId = ReturnType<typeof getEscolaId>;

/** Turnos em que cada professor tem pelo menos uma aula na grade oficial. */
export async function turnosComAulaPorProfessor(
  escolaId: EscolaId,
  professorIds: number[],
): Promise<Map<number, Set<string>>> {
  const mapa = new Map<number, Set<string>>();
  if (professorIds.length === 0) return mapa;
  const linhas = await db
    .select({ professorId: horariosTable.professorId, turno: turmasTable.turno })
    .from(horariosTable)
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(and(eq(horariosTable.escolaId, escolaId), inArray(horariosTable.professorId, professorIds)));
  for (const l of linhas) {
    if (l.professorId == null || !l.turno) continue;
    let s = mapa.get(l.professorId);
    if (!s) { s = new Set<string>(); mapa.set(l.professorId, s); }
    s.add(l.turno);
  }
  return mapa;
}

/** Acrescenta "contraturno" em cada linha (true so para HA fora dos turnos de aula). */
export function marcarContraturno<
  T extends { professorId: number | null; turno?: string | null; horaAtividadeObrigatoria?: boolean | null },
>(rows: T[], turnosComAula: Map<number, Set<string>>): Array<T & { contraturno: boolean }> {
  return rows.map((r) => ({
    ...r,
    contraturno:
      !!r.horaAtividadeObrigatoria &&
      !!r.turno &&
      r.professorId != null &&
      !(turnosComAula.get(r.professorId)?.has(r.turno) ?? false),
  }));
}
