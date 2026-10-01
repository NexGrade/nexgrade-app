// [OCUPACAO-SALAS] (2026-10-01) Ocupacao dos espacos num dia: so sala, aula e
// status (sem nomes), para o professor ver o que esta livre antes de reservar.
import { db, reservasTable, horarioSlotsTable } from "@workspace/db";
import { and, eq, gte, lte, ne } from "drizzle-orm";

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

// [CALENDARIO-RESERVA] ocupacao de um espaco no mes inteiro (uma consulta so):
// por dia, quantas aulas estao confirmadas e quantas pendentes. Sem nomes.
export type OcupacaoMes = {
  mes: string; // AAAA-MM
  maxAula: number;
  dias: Record<string, { confirmadas: number; pendentes: number }>;
};

export async function ocupacaoDoMes(escolaId: string, salaId: number, mes: string): Promise<OcupacaoMes> {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const inicio = mes + "-01";
  const fim = mes + "-" + String(ultimoDia).padStart(2, "0");
  const [linhas, slots] = await Promise.all([
    db
      .select({ data: reservasTable.data, status: reservasTable.status })
      .from(reservasTable)
      .where(and(
        eq(reservasTable.escolaId, escolaId),
        eq(reservasTable.salaId, salaId),
        gte(reservasTable.data, inicio),
        lte(reservasTable.data, fim),
        ne(reservasTable.status, "cancelada"),
      )),
    db
      .select({ numeroAula: horarioSlotsTable.numeroAula, letivo: horarioSlotsTable.letivo })
      .from(horarioSlotsTable)
      .where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);
  const maxAula = Math.max(5, ...slots.filter((s) => s.letivo !== false).map((s) => s.numeroAula));
  const dias: OcupacaoMes["dias"] = {};
  for (const l of linhas) {
    const d = (dias[l.data] ??= { confirmadas: 0, pendentes: 0 });
    if (l.status === "confirmada") d.confirmadas++;
    else if (l.status === "pendente") d.pendentes++;
  }
  return { mes, maxAula, dias };
}
