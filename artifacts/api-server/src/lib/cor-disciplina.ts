// [CORES-DISCIPLINAS] (28/10/2026) Cor de disciplina nova: a mesma que essa disciplina ja tem nas outras
// escolas (pelo Codigo Externo do RCO, senao pelo nome), para a grade ficar colorida igual em todas.
// O padrao veio do Mario Braga (lib/db/padronizar-cores-disciplinas.cjs). Disciplina que nenhuma escola
// tem ainda: cor fixa de uma paleta, calculada pelo codigo (ou pelo nome).
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const COR_PADRAO = "#6366f1";
const PALETA = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c", "#64748b"];

const chaveNome = (x: string) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function corDaPaleta(chave: string): string {
  let h = 0;
  for (const ch of chave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length]!;
}

export type CoresReferencia = { porCodigo: Map<number, string>; porNome: Map<string, string> };

/** Cor mais usada de cada disciplina nas escolas (fora a cor padrao). Uma consulta; chamar uma vez por operacao. */
export async function carregarCoresReferencia(): Promise<CoresReferencia> {
  const r: any = await db.execute(sql`
    select codigo_externo_rco as cod, nome, cor, count(*)::int as n from disciplinas
     where cor is not null and lower(cor) <> ${COR_PADRAO}
     group by codigo_externo_rco, nome, cor order by n desc`);
  const linhas = (r?.rows ?? r ?? []) as Array<{ cod: number | null; nome: string; cor: string; n: number }>;
  const contaCod = new Map<string, number>(), contaNome = new Map<string, number>();
  for (const l of linhas) {
    if (l.cod != null) { const k = `${l.cod}|${l.cor}`; contaCod.set(k, (contaCod.get(k) ?? 0) + Number(l.n)); }
    const k = `${chaveNome(l.nome)}|${l.cor}`; contaNome.set(k, (contaNome.get(k) ?? 0) + Number(l.n));
  }
  const melhor = (conta: Map<string, number>) => {
    const out = new Map<string, { cor: string; n: number }>();
    for (const [k, n] of conta) {
      const i = k.lastIndexOf("|"); const chave = k.slice(0, i), cor = k.slice(i + 1);
      const atual = out.get(chave);
      if (!atual || n > atual.n) out.set(chave, { cor, n });
    }
    return out;
  };
  const porCodigo = new Map<number, string>();
  for (const [k, v] of melhor(contaCod)) porCodigo.set(Number(k), v.cor);
  const porNome = new Map<string, string>();
  for (const [k, v] of melhor(contaNome)) porNome.set(k, v.cor);
  return { porCodigo, porNome };
}

/** Cor para uma disciplina nova. */
export function corParaDisciplina(ref: CoresReferencia, codigoExternoRco: number | null | undefined, nome: string): string {
  if (codigoExternoRco != null) {
    const c = ref.porCodigo.get(Number(codigoExternoRco));
    if (c) return c;
  }
  return ref.porNome.get(chaveNome(nome)) ?? corDaPaleta(codigoExternoRco != null ? `cod${codigoExternoRco}` : chaveNome(nome));
}
