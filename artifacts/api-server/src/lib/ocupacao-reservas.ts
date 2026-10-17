// [OCUPACAO-SALAS] (2026-10-01) Ocupacao dos espacos num dia: so sala, aula e
// status (sem nomes), para o professor ver o que esta livre antes de reservar.
import { db, reservasTable, horarioSlotsTable } from "@workspace/db";
import { bloqueiosAtivos, rotuloMotivo, slotsDoBloqueio } from "./bloqueios"; // [BLOQUEIOS]
import { and, eq, gte, lte, ne } from "drizzle-orm";

export type OcupacaoDia = {
  data: string;
  maxAula: number;
  ocupacao: Array<{ salaId: number; numeroAula: number; status: string; turno: string | null; motivo?: string }>; // [RESERVA-TURNO] [BLOQUEIOS] status "bloqueada" = sala em manutencao/limpeza/outro
};

export async function ocupacaoDoDia(escolaId: string, data: string): Promise<OcupacaoDia> {
  const [linhas, slots] = await Promise.all([
    db
      .select({ salaId: reservasTable.salaId, numeroAula: reservasTable.numeroAula, status: reservasTable.status, turno: reservasTable.turno })
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
  // [BLOQUEIOS] aulas bloqueadas entram como status "bloqueada" (periodo "todos" vira um por periodo)
  const bloqueios = (await bloqueiosAtivos(escolaId, data, data)).filter((b) => b.alvoTipo === "sala" && b.salaId !== null);
  const bloqueadas: OcupacaoDia["ocupacao"] = [];
  for (const b of bloqueios) {
    const { turnos, aulas } = slotsDoBloqueio(b, maxAula);
    for (const turno of turnos) for (const numeroAula of aulas) bloqueadas.push({ salaId: b.salaId!, numeroAula, status: "bloqueada", turno, motivo: rotuloMotivo(b) });
  }
  return { data, maxAula, ocupacao: [...linhas, ...bloqueadas] };
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
  // [BLOQUEIOS] aulas bloqueadas contam como ocupadas no calendario (dia todo bloqueado = dia lotado)
  const bloqueios = (await bloqueiosAtivos(escolaId, inicio, fim, { salaId })).filter((b) => b.alvoTipo === "sala");
  for (const b of bloqueios) {
    const { turnos, aulas } = slotsDoBloqueio(b, maxAula);
    const ate = b.dataFim < fim ? b.dataFim : fim;
    for (let d = new Date(`${b.dataInicio < inicio ? inicio : b.dataInicio}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      (dias[iso] ??= { confirmadas: 0, pendentes: 0 }).confirmadas += turnos.length * aulas.length;
    }
  }
  return { mes, maxAula, dias };
}
