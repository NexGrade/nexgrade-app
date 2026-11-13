// [EQUIPE-APOIO] (12/11/2026) Equipe de apoio no Ponto Diario (pedagogos, PAEE, interpretes, PAC e
// Sala de Recursos): validacao do cadastro e quem entra em cada turno da folha. Sem banco aqui, para
// testar sem Postgres. A tabela fica em lib/db/src/schema/equipe_apoio.ts.
import { z } from "zod";
import { FUNCOES_EQUIPE_APOIO, TURNOS_EQUIPE_APOIO, type FuncaoEquipeApoio, type ExpedienteEquipeApoio } from "@workspace/db";

export const ROTULO_FUNCAO: Record<FuncaoEquipeApoio, string> = {
  pedagogo: "Pedagogia",
  paee: "PAEE",
  interprete: "Intérprete",
  pac: "PAC",
  sala_recursos: "Sala de Recursos",
};

export const EquipeApoioInput = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(120),
  funcao: z.enum(FUNCOES_EQUIPE_APOIO),
  complemento: z.string().trim().max(40).nullish().transform((v) => (v ? v : null)),
  expediente: z
    .array(z.object({ dia: z.number().int().min(0).max(4), turno: z.enum(TURNOS_EQUIPE_APOIO) }))
    .min(1, "Marque pelo menos um dia e turno.")
    .transform(normalizarExpediente),
});
export type EquipeApoioEntrada = z.infer<typeof EquipeApoioInput>;

/** Tira repetidos e ordena por dia e turno (manha, tarde, noite). */
export function normalizarExpediente(lista: ExpedienteEquipeApoio[]): ExpedienteEquipeApoio[] {
  const vistos = new Set<string>();
  const saida: ExpedienteEquipeApoio[] = [];
  for (const e of lista) {
    const k = `${e.dia}|${e.turno}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push({ dia: e.dia, turno: e.turno });
  }
  const ordemTurno = (t: string) => TURNOS_EQUIPE_APOIO.indexOf(t as (typeof TURNOS_EQUIPE_APOIO)[number]);
  return saida.sort((a, b) => a.dia - b.dia || ordemTurno(a.turno) - ordemTurno(b.turno));
}

/** Texto que vai na celula larga da folha: "Pedagogia", "Intérprete · 2ºA". */
export function rotuloEquipe(funcao: string, complemento?: string | null): string {
  const base = ROTULO_FUNCAO[funcao as FuncaoEquipeApoio] ?? funcao;
  const c = (complemento ?? "").trim();
  return c ? `${base} · ${c}` : base; // "·" (o travessao sai como "?" no PDF)
}

export type PessoaEquipe = { nome: string; funcao: string; complemento: string | null; expediente: unknown };
export type LinhaEquipe = { nome: string; funcao: string };

const ORDEM_FUNCAO = new Map<string, number>(FUNCOES_EQUIPE_APOIO.map((f, i) => [f, i]));

/** Quem da equipe trabalha nesse dia (0 = segunda) e turno, agrupado pela funcao e depois pelo nome. */
export function linhasEquipeDoTurno(pessoas: PessoaEquipe[], diaSemana: number, turno: string): LinhaEquipe[] {
  return pessoas
    .filter((p) => Array.isArray(p.expediente) && (p.expediente as ExpedienteEquipeApoio[]).some((e) => e?.dia === diaSemana && e?.turno === turno))
    .sort((a, b) => (ORDEM_FUNCAO.get(a.funcao) ?? 99) - (ORDEM_FUNCAO.get(b.funcao) ?? 99) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => ({ nome: p.nome, funcao: rotuloEquipe(p.funcao, p.complemento) }));
}

/** Tabela ainda nao criada (migracao atrasada): codigo 42P01 do Postgres. */
export function semTabelaEquipe(e: unknown): boolean {
  const c = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return c === "42P01";
}
