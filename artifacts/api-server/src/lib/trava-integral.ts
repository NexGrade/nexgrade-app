// [TRAVA-INTEGRAL] (11/11/2026, pedido da dona) A turma de periodo integral (ex.: 1ME DOC) nao pode ser alterada:
// aulas, horarios e professores dela ficam como estao, por qualquer caminho (gerar, Melhorar, rascunho, trocar aula,
// aula a mao, Turmas, voltar copia). So muda com a integral DESTRAVADA, por um tempo curto, a pedido explicito da
// direcao (botao "Destravar a integral"). Fica em configuracoes (chave "integral.destravada"), sem migracao: sem a
// chave, a integral esta travada.
//
// Escola sem turma integral nao e afetada (nenhuma checagem recusa nada).
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, configuracoesTable, horariosTable, turmasTable } from "@workspace/db";
import { TURNO_INTEGRAL, carregarAulasIntegraisNoTurno } from "./turno-integral";

const CHAVE = "integral.destravada";
/** Tempo maximo de uma destrava: passou disso, a integral volta a ficar travada sozinha. */
export const HORAS_DESTRAVA_MAX = 4;
export const HORAS_DESTRAVA_PADRAO = 1;
/** Status HTTP da recusa: 423 (Locked). */
export const STATUS_TRAVA_INTEGRAL = 423;

export type DestravaIntegral = { ate: string; em: string; por: string | null };
export type SituacaoTravaIntegral = { temIntegral: boolean; travada: boolean; turmas: { id: number; nome: string }[]; destrava: DestravaIntegral | null };

async function lerDestravaBruta(escolaId: string): Promise<DestravaIntegral | null> {
  const [r] = await db.select({ valor: configuracoesTable.valor }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE)));
  const v = r?.valor as DestravaIntegral | null | undefined;
  return v && typeof v.ate === "string" ? v : null;
}

/** Destrava valida agora (null se nunca destravou ou se o prazo passou). */
export async function lerDestrava(escolaId: string, agora = new Date()): Promise<DestravaIntegral | null> {
  const v = await lerDestravaBruta(escolaId);
  if (!v) return null;
  const ate = new Date(v.ate);
  return Number.isFinite(ate.getTime()) && ate > agora ? v : null;
}

export async function turmasIntegrais(escolaId: string): Promise<{ id: number; nome: string }[]> {
  return db.select({ id: turmasTable.id, nome: turmasTable.nome }).from(turmasTable)
    .where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.turno, TURNO_INTEGRAL)));
}

export async function situacaoTravaIntegral(escolaId: string): Promise<SituacaoTravaIntegral> {
  const [turmas, destrava] = await Promise.all([turmasIntegrais(escolaId), lerDestrava(escolaId)]);
  return { temIntegral: turmas.length > 0, travada: turmas.length > 0 && !destrava, turmas, destrava };
}

export async function destravarIntegral(escolaId: string, horas: number, por: string | null): Promise<DestravaIntegral> {
  const h = Math.min(Math.max(horas, 0.25), HORAS_DESTRAVA_MAX);
  const agora = new Date();
  const v: DestravaIntegral = { ate: new Date(agora.getTime() + h * 3600_000).toISOString(), em: agora.toISOString(), por };
  await travarIntegral(escolaId);
  await db.insert(configuracoesTable).values({ escolaId, chave: CHAVE, valor: v, descricao: "Turma integral destravada para mudancas (volta a travar sozinha)" });
  return v;
}

export async function travarIntegral(escolaId: string): Promise<void> {
  await db.delete(configuracoesTable).where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE)));
}

/** Texto da recusa (funcao pura, testada). */
export function mensagemTravaIntegral(nomes: string[], oQue: string): string {
  const quais = nomes.length ? nomes.join(", ") : "turma integral";
  return `${quais} é turma de período integral e está travada: ${oQue} não é permitido. `
    + `Para mudar, a direção precisa clicar em "Destravar a integral" (Gerar Grade → Grade).`;
}

/**
 * Recusa (texto) se alguma das turmas for integral e a integral estiver travada; null se pode seguir.
 * `turmaIds` = turmas que a acao mexe (ids de fora da escola sao ignorados).
 */
export async function recusaTravaIntegral(escolaId: string, turmaIds: Iterable<number>, oQue: string): Promise<string | null> {
  const ids = new Set(turmaIds);
  if (!ids.size) return null;
  const integrais = (await turmasIntegrais(escolaId)).filter((t) => ids.has(t.id));
  if (!integrais.length) return null;
  if (await lerDestrava(escolaId)) return null;
  return mensagemTravaIntegral(integrais.map((t) => t.nome), oQue);
}

/** Recusa se a integral estiver travada e a escola tiver turma integral (acoes que mexem na escola toda). */
export async function recusaSeTemIntegralTravada(escolaId: string, oQue: string): Promise<string | null> {
  const integrais = await turmasIntegrais(escolaId);
  if (!integrais.length || (await lerDestrava(escolaId))) return null;
  return mensagemTravaIntegral(integrais.map((t) => t.nome), oQue);
}

/**
 * [DOC-TRAVADA] em todas as rotas: o horario em que o professor da aula na turma integral nao pode ser bloqueado
 * nem receber HA/atividade (a tela Disponibilidade e o lote ja faziam; faltavam a rota de um horario e o Assistente).
 * Devolve a turma integral desse horario, ou null.
 */
export async function aulaDOCNoHorario(escolaId: string, professorId: number, turno: string | null | undefined, diaSemana: number, horarioSlot: number): Promise<string | null> {
  if (!turno) return null;
  const aulas = await carregarAulasIntegraisNoTurno(escolaId, turno, [professorId]);
  const a = aulas.find((x) => x.diaSemana === diaSemana && x.numeroAula === horarioSlot);
  if (!a) return null;
  const [t] = await db.select({ nome: turmasTable.nome }).from(turmasTable).where(eq(turmasTable.id, a.turmaId));
  return t?.nome ?? "turma integral";
}

type AulaComparavel = { turmaId: number; disciplinaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona?: boolean | null };

/** Chave de uma aula para comparar duas grades (funcao pura, testada). */
export function chaveAula(a: AulaComparavel): string {
  return `${a.turmaId}|${a.disciplinaId}|${a.professorId ?? "-"}|${a.diaSemana}|${a.numeroAula}|${a.assincrona ? 1 : 0}`;
}

/** Turmas (dentre `turmaIds`) cujas aulas sao diferentes entre as duas listas (funcao pura, testada). */
export function turmasQueMudam(turmaIds: Iterable<number>, antes: AulaComparavel[], depois: AulaComparavel[]): number[] {
  const mudam: number[] = [];
  for (const id of turmaIds) {
    const a = antes.filter((x) => x.turmaId === id).map(chaveAula).sort();
    const d = depois.filter((x) => x.turmaId === id).map(chaveAula).sort();
    if (a.length !== d.length || a.some((k, i) => k !== d[i])) mudam.push(id);
  }
  return mudam;
}

/** Aulas oficiais de algumas turmas (para comparar com o experimento ou a copia de seguranca). */
export async function aulasOficiaisDasTurmas(escolaId: string, turmaIds: number[]): Promise<AulaComparavel[]> {
  if (!turmaIds.length) return [];
  return db.select({
    turmaId: horariosTable.turmaId, disciplinaId: horariosTable.disciplinaId, professorId: horariosTable.professorId,
    diaSemana: horariosTable.diaSemana, numeroAula: horariosTable.numeroAula, assincrona: horariosTable.assincrona,
  }).from(horariosTable).where(and(
    eq(horariosTable.escolaId, escolaId), inArray(horariosTable.turmaId, turmaIds),
    sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`,
  ));
}

/**
 * Recusa se, com a integral travada, a grade nova (`depois`) mudar alguma aula de turma integral em relacao a oficial.
 * So olha as turmas integrais presentes em `depois` (rascunho de um turno que copiou a escola toda e nao mexeu na
 * integral passa: as aulas dela sao iguais as da oficial).
 */
export async function recusaSeMudaIntegral(escolaId: string, depois: AulaComparavel[], oQue: string, turmasConsideradas?: Iterable<number>): Promise<string | null> {
  const integrais = await turmasIntegrais(escolaId);
  if (!integrais.length) return null;
  const consideradas = new Set(turmasConsideradas ?? depois.map((a) => a.turmaId));
  const alvo = integrais.filter((t) => consideradas.has(t.id));
  if (!alvo.length || (await lerDestrava(escolaId))) return null;
  const antes = await aulasOficiaisDasTurmas(escolaId, alvo.map((t) => t.id));
  const mudam = new Set(turmasQueMudam(alvo.map((t) => t.id), antes, depois));
  if (!mudam.size) return null;
  return mensagemTravaIntegral(alvo.filter((t) => mudam.has(t.id)).map((t) => t.nome), oQue);
}
