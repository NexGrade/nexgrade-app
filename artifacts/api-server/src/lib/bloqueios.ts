import { and, eq, gte, lte } from "drizzle-orm";
import { bloqueiosTable, db, horarioSlotsTable, type Bloqueio } from "@workspace/db";

// [BLOQUEIOS] (17/10/2026) Sala ou equipamento indisponivel por um periodo (manutencao, limpeza, outro motivo).
// Regras de leitura usadas pela validacao de reserva, pela ocupacao (mapa/calendario) e pela capacidade dos tablets.

export const MOTIVOS = ["manutencao", "limpeza", "outro"] as const;
export type Motivo = (typeof MOTIVOS)[number];
const ROTULO_MOTIVO: Record<Motivo, string> = { manutencao: "Manutenção", limpeza: "Limpeza", outro: "Outro motivo" };
export const TURNOS = ["matutino", "vespertino", "noturno"] as const;

/** texto curto do motivo: "Manutenção", "Limpeza" ou a descricao digitada em "Outro motivo" */
export function rotuloMotivo(b: Pick<Bloqueio, "motivo" | "descricao">): string {
  if (b.motivo === "outro") return b.descricao?.trim() || ROTULO_MOTIVO.outro;
  return ROTULO_MOTIVO[b.motivo as Motivo] ?? b.motivo;
}

type Executor = Pick<typeof db, "select">;

/**
 * Bloqueios ativos que tocam o intervalo [inicio, fim] (datas AAAA-MM-DD).
 * Se a tabela ainda nao existe (deploy antes da migracao), devolve vazio em vez de derrubar as reservas.
 */
export async function bloqueiosAtivos(
  escolaId: string,
  inicio: string,
  fim: string,
  filtro: { salaId?: number; recursoId?: number } = {},
  executor: Executor = db,
): Promise<Bloqueio[]> {
  try {
    const rows = await executor
      .select()
      .from(bloqueiosTable)
      .where(and(eq(bloqueiosTable.escolaId, escolaId), eq(bloqueiosTable.ativo, true), lte(bloqueiosTable.dataInicio, fim), gte(bloqueiosTable.dataFim, inicio)));
    return rows.filter((b) => (filtro.salaId === undefined || b.salaId === filtro.salaId) && (filtro.recursoId === undefined || b.recursoId === filtro.recursoId));
  } catch (err) {
    const codigo = (err as { cause?: { code?: string }; code?: string })?.cause?.code ?? (err as { code?: string })?.code;
    if (codigo === "42P01") {
      console.warn("[bloqueios] tabela ainda nao existe; ignorando bloqueios (rode as migracoes).");
      return [];
    }
    throw err;
  }
}

/** o bloqueio vale para este dia, periodo e aula? (periodo/aula nulos = todos) */
export function bloqueiaSlot(b: Pick<Bloqueio, "dataInicio" | "dataFim" | "turno" | "numerosAula">, data: string, turno: string | null, numeroAula: number): boolean {
  if (data < b.dataInicio || data > b.dataFim) return false;
  if (b.turno && turno && b.turno !== turno) return false;
  if (b.numerosAula && b.numerosAula.length > 0 && !b.numerosAula.includes(numeroAula)) return false;
  return true;
}

/** bloqueio que impede reservar esta sala neste dia/periodo/aula (o primeiro que achar) */
export async function bloqueioDaSala(
  escolaId: string,
  salaId: number,
  data: string,
  turno: string | null,
  numeroAula: number,
): Promise<Bloqueio | null> {
  const lista = await bloqueiosAtivos(escolaId, data, data, { salaId });
  return lista.find((b) => b.alvoTipo === "sala" && bloqueiaSlot(b, data, turno, numeroAula)) ?? null;
}

/** unidades do equipamento bloqueadas neste dia/periodo/aula (bloqueio sem quantidade = todas as unidades) */
export function unidadesBloqueadas(bloqueios: Bloqueio[], total: number, data: string, turno: string | null, numeroAula: number): number {
  let soma = 0;
  for (const b of bloqueios) {
    if (b.alvoTipo !== "recurso" || !bloqueiaSlot(b, data, turno, numeroAula)) continue;
    soma += b.quantidade ?? total;
  }
  return Math.min(soma, total);
}

/** maior numero de aula letiva da escola (padrao 5), para expandir "dia inteiro" em aulas */
export async function maxAulaDaEscola(escolaId: string): Promise<number> {
  const slots = await db
    .select({ numeroAula: horarioSlotsTable.numeroAula, letivo: horarioSlotsTable.letivo })
    .from(horarioSlotsTable)
    .where(eq(horarioSlotsTable.escolaId, escolaId));
  return Math.max(5, ...slots.filter((s) => s.letivo !== false).map((s) => s.numeroAula));
}

/** aulas e periodos afetados por um bloqueio (expande "dia inteiro" e "todos os periodos") */
export function slotsDoBloqueio(b: Bloqueio, maxAula: number): { turnos: string[]; aulas: number[] } {
  const aulas = b.numerosAula && b.numerosAula.length > 0 ? [...b.numerosAula] : Array.from({ length: maxAula }, (_, i) => i + 1);
  const turnos = b.turno ? [b.turno] : [...TURNOS];
  return { turnos, aulas };
}
