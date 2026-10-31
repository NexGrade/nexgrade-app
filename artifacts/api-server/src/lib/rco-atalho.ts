// [RCO-ATALHO] (31/10/2026) Atalho de gravacao no RCO sem F12: um favorito (bookmarklet) que a
// escola arrasta uma vez para a barra de favoritos. Na tela Grade de Horario do RCO, com o Periodo
// Letivo e o Turno escolhidos, um clique nele carrega o script de gravacao do NexGrade (o mesmo do
// F12, com previa e confirmacao) pela rota publica /api/rco-atalho/<chave>.js?turno=...
// - Carrega por <script src> (o navegador nao manda Origin, entao o CORS da API nao barra).
// - A chave e da escola (configuracoes "rco_atalho"); quem tem a chave grava a grade DESSA escola no
//   RCO em que estiver logado. Trocar a chave invalida os favoritos antigos.
// - Decisao da dona (31/10/2026): liberado para todas as escolas (antes o script era so do suporte).
import { randomBytes } from "node:crypto";
import { db, configuracoesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export const CHAVE_CONFIG_ATALHO = "rco_atalho";
const FORMATO_CHAVE = /^[A-Za-z0-9_-]{20,64}$/;

/** Turno do NexGrade pelo texto do combo Turno do RCO (Manha, Tarde, Noite, Integral). */
export const TURNO_PELO_RCO: Record<string, string> = { manha: "matutino", tarde: "vespertino", noite: "noturno", integral: "integral" };

type ValorAtalho = { chave: string; criadaEm: string; ultimoUsoEm?: string | null };

function novaChave(): string {
  return randomBytes(24).toString("base64url");
}

async function lerAtalho(escolaId: string) {
  const [linha] = await db.select().from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_CONFIG_ATALHO)));
  return linha;
}

/** Chave do atalho da escola; cria na primeira vez. */
export async function chaveDoAtalho(escolaId: string): Promise<ValorAtalho> {
  const linha = await lerAtalho(escolaId);
  const valor = linha?.valor as ValorAtalho | undefined;
  if (valor?.chave && FORMATO_CHAVE.test(valor.chave)) return valor;
  return trocarChaveDoAtalho(escolaId);
}

/** Gera chave nova: os favoritos com a chave antiga param de funcionar. */
export async function trocarChaveDoAtalho(escolaId: string): Promise<ValorAtalho> {
  const valor: ValorAtalho = { chave: novaChave(), criadaEm: new Date().toISOString(), ultimoUsoEm: null };
  const linha = await lerAtalho(escolaId);
  if (linha) {
    await db.update(configuracoesTable).set({ valor: valor as any, updatedAt: new Date() }).where(eq(configuracoesTable.id, linha.id));
  } else {
    await db.insert(configuracoesTable).values({
      escolaId, chave: CHAVE_CONFIG_ATALHO, valor: valor as any,
      descricao: "Chave do atalho de gravação no RCO (favorito do navegador)",
    });
  }
  return valor;
}

/** Escola dona da chave (null se a chave nao existe ou foi trocada). */
export async function escolaDaChave(chave: string): Promise<string | null> {
  if (!FORMATO_CHAVE.test(chave)) return null;
  const [linha] = await db.select({ escolaId: configuracoesTable.escolaId }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.chave, CHAVE_CONFIG_ATALHO), sql`${configuracoesTable.valor}->>'chave' = ${chave}`));
  return linha?.escolaId ?? null;
}

export async function marcarUsoDoAtalho(escolaId: string): Promise<void> {
  await db.update(configuracoesTable)
    .set({ valor: sql`jsonb_set(${configuracoesTable.valor}, '{ultimoUsoEm}', to_jsonb(${new Date().toISOString()}::text))` })
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_CONFIG_ATALHO)));
}

/** Origem do NexGrade aceita no favorito (https://dominio[:porta], ou http so em localhost). */
export function origemValida(origem: string): boolean {
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origem) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

/**
 * Codigo do favorito. Sem "%" nem "#" (o navegador decodifica/corta o endereco javascript:).
 * Le o turno escolhido no RCO, carrega o script da escola e avisa se nao der para carregar.
 */
export function montarFavorito(origem: string, chave: string): string {
  if (!origemValida(origem)) throw new Error("origem invalida");
  if (!FORMATO_CHAVE.test(chave)) throw new Error("chave invalida");
  const mapa = JSON.stringify(TURNO_PELO_RCO).replace(/"/g, "'");
  const codigo = [
    "(function(){",
    "var c=document.getElementsByName('codTurno')[0];",
    "var o=c&&c.options?c.options[c.selectedIndex]:null;",
    "var x=((o&&o.text)||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();",
    `var t=(${mapa})[x];`,
    "if(!t){alert('NexGrade: abra a tela Grade de Horario do RCO e escolha o Periodo Letivo e o Turno antes de clicar no atalho.');return;}",
    "var s=document.createElement('script');",
    `s.src='${origem}/api/rco-atalho/${chave}.js?turno='+t+'&v='+Date.now();`,
    "s.onerror=function(){alert('NexGrade: nao foi possivel carregar a gravacao. Confira a internet; se continuar, use o script pelo F12 ou chame o suporte NexGrade.');};",
    "document.body.appendChild(s);",
    "})();",
  ].join("");
  return `javascript:${codigo}`;
}

/** Resposta em JavaScript que so avisa (a rota publica responde script, nao JSON). */
export function scriptDeAviso(mensagem: string): string {
  return `alert(${JSON.stringify(`NexGrade: ${mensagem}`).replace(/</g, "\\u003c")});\n`;
}
