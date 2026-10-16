// [PAUSA-ENTRE-TURNOS] (16/10/2026) Entre o fim de um turno e o comeco do outro, no mesmo dia, o
// professor precisa de pelo menos 1 hora livre (sem aula e sem HA). Usa os horarios reais do
// esquema de cada turno (horario_slots). Ex.: Romario, 6a da manha 11:55-12:45 e 1a da tarde
// 13:00 = 15 min -> nao pode ter as duas no mesmo dia.
// - Conflitos: lista cada caso (aula x aula = alto; envolvendo HA = medio).
// - Motor: os horarios que quebrariam a pausa vao como "evitar" (penalidade, nao proibicao),
//   para nao deixar a geracao sem solucao enquanto a grade atual ainda tiver esses casos.
// HA_PAUSA_ENTRE_TURNOS_MIN muda os 60 minutos (0 desliga), igual ao recalculo de HA.
import { db, horariosTable, turmasTable, horarioSlotsTable, disponibilidadeTable, professoresTable } from "@workspace/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { carregarAssSoTurma } from "./assincrona-so-turma";

export const PAUSA_MIN_TURNOS = (): number => Number(process.env.HA_PAUSA_ENTRE_TURNOS_MIN ?? "60");

type Item = { professorId: number; turno: string; dia: number; aula: number; tipo: "aula" | "HA"; turmaId: number | null };

async function faixasDaEscola(escolaId: string): Promise<Map<string, [number, number]>> {
  const slots = await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));
  const faixa = new Map<string, [number, number]>();
  for (const s of slots) {
    const [h, m] = String(s.horaInicio).slice(0, 5).split(":").map(Number);
    const ini = (h ?? 0) * 60 + (m ?? 0);
    const fim = ini + (s.duracaoMinutos ?? 50);
    const k = `${s.turno}|${s.numeroAula}`;
    const a = faixa.get(k);
    faixa.set(k, a ? [Math.min(a[0], ini), Math.max(a[1], fim)] : [ini, fim]);
  }
  return faixa;
}

/** distancia em minutos entre dois horarios (negativa se sobrepostos) */
function distancia(a: [number, number], b: [number, number]): number {
  return a[1] <= b[0] ? b[0] - a[1] : b[1] <= a[0] ? a[0] - b[1] : -1;
}

async function itensDaEscola(escolaId: string, professorIds?: number[]): Promise<Item[]> {
  const ehAssSoTurma = await carregarAssSoTurma(escolaId);
  const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const condH = [eq(horariosTable.escolaId, escolaId), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`];
  if (professorIds) condH.push(inArray(horariosTable.professorId, professorIds.length ? professorIds : [-1]));
  const aulas = await db.select().from(horariosTable).where(and(...condH));
  const itens: Item[] = [];
  for (const h of aulas) {
    const t = turmaMap.get(h.turmaId);
    if (!t || ehAssSoTurma(h, t)) continue; // a 7a aula (so da turma) nao ocupa o professor
    itens.push({ professorId: h.professorId, turno: t.turno, dia: h.diaSemana, aula: h.numeroAula, tipo: "aula", turmaId: h.turmaId });
  }
  const profs = professorIds ?? (await db.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))).map((p) => p.id);
  if (profs.length) {
    const has = await db.select().from(disponibilidadeTable)
      .where(and(inArray(disponibilidadeTable.professorId, profs), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)));
    for (const d of has) if (d.turno) itens.push({ professorId: d.professorId, turno: d.turno, dia: d.diaSemana, aula: d.horarioSlot, tipo: "HA", turmaId: null });
  }
  return itens;
}

export type CasoPausa = { professorId: number; dia: number; a: Item; b: Item; pausaMin: number };

/** Casos da grade oficial com menos de 1 hora entre dois turnos no mesmo dia. */
export async function casosPausaEntreTurnos(escolaId: string): Promise<CasoPausa[]> {
  const min = PAUSA_MIN_TURNOS();
  if (min <= 0) return [];
  const faixa = await faixasDaEscola(escolaId);
  const itens = await itensDaEscola(escolaId);
  const porProfDia = new Map<string, Item[]>();
  for (const i of itens) {
    const k = `${i.professorId}|${i.dia}`;
    if (!porProfDia.has(k)) porProfDia.set(k, []);
    porProfDia.get(k)!.push(i);
  }
  const casos: CasoPausa[] = [];
  const vistos = new Set<string>();
  for (const l of porProfDia.values()) {
    for (const x of l) for (const y of l) {
      if (x.turno >= y.turno) continue;
      if (x.tipo === "HA" && y.tipo === "HA") continue;
      const fa = faixa.get(`${x.turno}|${x.aula}`);
      const fb = faixa.get(`${y.turno}|${y.aula}`);
      if (!fa || !fb) continue;
      const d = distancia(fa, fb);
      if (d >= min) continue;
      const k = `${x.professorId}|${x.dia}|${x.turno}${x.aula}|${y.turno}${y.aula}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      casos.push({ professorId: x.professorId, dia: x.dia, a: x, b: y, pausaMin: d });
    }
  }
  return casos;
}

/**
 * Para o motor: horarios do turno que vai ser gerado que ficariam a menos de 1 hora de alguma
 * aula/HA oficial do mesmo professor em OUTRO turno no mesmo dia. Vao como "evitar" (penalidade).
 */
export async function evitarPorPausaEntreTurnos(
  escolaId: string,
  turno: string,
  professorIds: number[],
  nomeProfessor: (id: number) => string,
): Promise<Array<{ professor: string; dia: number; aula: number }>> {
  const min = PAUSA_MIN_TURNOS();
  if (min <= 0 || !professorIds.length) return [];
  const faixa = await faixasDaEscola(escolaId);
  const aulasDoTurno = [...faixa.keys()].filter((k) => k.startsWith(`${turno}|`)).map((k) => Number(k.split("|")[1]));
  const itens = (await itensDaEscola(escolaId, professorIds)).filter((i) => i.turno !== turno);
  const out = new Map<string, { professor: string; dia: number; aula: number }>();
  for (const i of itens) {
    const fi = faixa.get(`${i.turno}|${i.aula}`);
    if (!fi) continue;
    for (const a of aulasDoTurno) {
      const fa = faixa.get(`${turno}|${a}`)!;
      if (distancia(fa, fi) < min) {
        const k = `${i.professorId}|${i.dia}|${a}`;
        if (!out.has(k)) out.set(k, { professor: nomeProfessor(i.professorId), dia: i.dia, aula: a });
      }
    }
  }
  return [...out.values()];
}
