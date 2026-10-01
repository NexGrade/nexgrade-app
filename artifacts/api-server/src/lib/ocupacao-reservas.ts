// [OCUPACAO-SALAS] (2026-10-01) Ocupacao dos espacos num dia: so sala, aula e
// status (sem nomes), para o professor ver o que esta livre antes de reservar.
import { db, reservasTable, horarioSlotsTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

export type OcupacaoDia = {
  data: string;
  maxAula: number;
  ocupacao: Array<{ salaId: number; numeroAula: number; status: string }>;
};

export async function ocupacaoDoDia(escolaId: string, data: string): Promise<OcupacaoDia> {
  const [linhas, slots] = await Promise.all([
    db
      .select({ salaId: reservasTable.salaId, numeroAula: reservasTable.numeroAula, status: reservasTable.status })
      .from(reservasTable)
      .where(and(eq(reservasTable.escolaId, escolaId), eq(reservasTable.data, data), ne(reservasTable.status, "cancelada"))),
    db
      .select({ numeroAula: horarioSlotsTable.numeroAula, letivo: horarioSlotsTable.letivo })
      .from(horarioSlotsTable)
      .where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);
  const maxAula = Math.max(
    5,
    ...slots.filter((s) => s.letivo !== false).map((s) => s.numeroAula),
    ...linhas.map((l) => l.numeroAula),
  );
  return { data, maxAula, ocupacao: linhas };
}
