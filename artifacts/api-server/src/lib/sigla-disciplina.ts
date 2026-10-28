// [SIGLA-UNICA] (28/10/2026) Sigla de disciplina nova no padrao NexGrade, igual em todas as escolas.
// Ordem: 1) padrao NexGrade pelo Codigo Externo do RCO (sigla-padrao.ts); 2) a sigla que as outras
// escolas ja usam para esse codigo (senao para esse nome); 3) a do catalogo / a digitada, se ja estiver
// no formato; 4) gerada: 3 letras por palavra, com ponto; I/II/III separado por espaco (ex. GES.ORG, HIS I).
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { SIGLA_PADRAO_POR_CODIGO } from "./sigla-padrao";

const PEQ = new Set(["a", "à", "ao", "aos", "as", "às", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelo", "por"]);
const ROMANO = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
const chaveNome = (x: string) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function palavrasDoNome(nome: string): { palavras: string[]; romano: string } {
  const partes = String(nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[:,;()\/\-–.]/g, " ").split(/\s+/).filter(Boolean);
  let romano = "";
  const ult = partes[partes.length - 1];
  if (ult && ROMANO.test(ult.toUpperCase()) && partes.length > 1) { romano = ult.toUpperCase(); partes.pop(); }
  const palavras = partes.filter((p) => !PEQ.has(p.toLowerCase()));
  return { palavras: palavras.length ? palavras : partes, romano };
}

/** Sigla gerada no padrao NexGrade. "Gestao Organizacional" -> GES.ORG; "Historia I" -> HIS I; "Arte" -> ART. */
export function gerarSiglaDisciplina(nome: string): string {
  const { palavras, romano } = palavrasDoNome(nome);
  const sig = palavras.slice(0, 3).map((p) => p.slice(0, 3).toUpperCase()).join(".");
  return romano ? `${sig} ${romano}` : sig;
}

/** Sigla so de iniciais (BI, FATF, LEI, FI2) num nome de 2 ou mais palavras: fora do padrao. */
export function siglaForaDoPadrao(sigla: string | null | undefined, nome: string): boolean {
  const s = String(sigla ?? "").trim();
  if (!s) return true;
  return /^[A-Z]{1,5}\d?$/.test(s) && palavrasDoNome(nome).palavras.length >= 2;
}

export type SiglasReferencia = { porCodigo: Map<number, string>; porNome: Map<string, string> };

/** Sigla mais usada de cada disciplina nas escolas. Uma consulta; chamar uma vez por operacao. */
export async function carregarSiglasReferencia(): Promise<SiglasReferencia> {
  const r: any = await db.execute(sql`
    select codigo_externo_rco as cod, nome, sigla, count(*)::int as n from disciplinas
     where sigla is not null and btrim(sigla) <> ''
     group by codigo_externo_rco, nome, sigla order by n desc`);
  const linhas = (r?.rows ?? r ?? []) as Array<{ cod: number | null; nome: string; sigla: string; n: number }>;
  const conta = (pares: Array<[string, string, number]>) => {
    const c = new Map<string, Map<string, number>>();
    for (const [k, s, n] of pares) {
      if (!c.has(k)) c.set(k, new Map());
      c.get(k)!.set(s, (c.get(k)!.get(s) ?? 0) + n);
    }
    const out = new Map<string, string>();
    for (const [k, m] of c) out.set(k, [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]);
    return out;
  };
  const porCodigo = new Map<number, string>();
  for (const [k, s] of conta(linhas.filter((l) => l.cod != null && !siglaForaDoPadrao(l.sigla, l.nome)).map((l) => [String(l.cod), l.sigla.trim(), Number(l.n)]))) porCodigo.set(Number(k), s);
  const porNome = conta(linhas.filter((l) => !siglaForaDoPadrao(l.sigla, l.nome)).map((l) => [chaveNome(l.nome), l.sigla.trim(), Number(l.n)]));
  return { porCodigo, porNome };
}

/** Sigla para uma disciplina nova. `sugerida` = a do catalogo ou a digitada na tela. */
export function siglaParaDisciplina(ref: SiglasReferencia | null, codigoExternoRco: number | null | undefined, nome: string, sugerida?: string | null): string {
  if (codigoExternoRco != null) {
    const p = SIGLA_PADRAO_POR_CODIGO[Number(codigoExternoRco)];
    if (p) return p;
    const c = ref?.porCodigo.get(Number(codigoExternoRco));
    if (c) return c;
  }
  const n = ref?.porNome.get(chaveNome(nome));
  if (n) return n;
  const s = String(sugerida ?? "").trim().toUpperCase();
  if (s && !siglaForaDoPadrao(s, nome)) return s;
  return gerarSiglaDisciplina(nome);
}
