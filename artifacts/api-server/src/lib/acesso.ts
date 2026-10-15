// [ACESSOS-ESCOLA] (15/10/2026) EM QUAL ESCOLA e COM QUAL CARGO a pessoa entra.
// Liga com ACESSOS_PELO_BANCO=1 (Render). Desligado, o servidor segue com as
// organizacoes do Clerk exatamente como antes.
//  - equipe (direcao, coordenacao, secretaria, reservas): tabela acessos_escola;
//  - professor: cadastro de Professores (professores.email, professor ativo);
//  - quem esta nas duas fica com o cargo da equipe.
// A escola ativa vem do cabecalho X-Escola-Id, sempre conferido contra a lista acima.
import type { Request, Response, NextFunction } from "express";
import { db, acessosEscolaTable, professoresTable, escolasTable } from "@workspace/db";
import { and, eq, sql, inArray } from "drizzle-orm";
import { usuarioLogado, emailVerificado } from "./identidade";

export function acessosPeloBanco(): boolean {
  return process.env.ACESSOS_PELO_BANCO === "1";
}

export type Cargo = "direcao" | "coordenacao" | "secretaria" | "reservas" | "professor";
export const CARGOS_EQUIPE = ["direcao", "coordenacao", "secretaria", "reservas"] as const;
/** cargos com acesso total ao sistema */
export const CARGOS_TOTAIS: ReadonlySet<string> = new Set(["direcao", "coordenacao", "secretaria"]);
export const ROTULO_CARGO: Record<Cargo, string> = {
  direcao: "Direção",
  coordenacao: "Coordenação",
  secretaria: "Secretaria",
  reservas: "Gestor de reservas",
  professor: "Professor",
};

export type EscolaDoUsuario = { escolaId: string; nome: string; cargo: Cargo };
export type Acesso = {
  userId: string;
  email: string | null;
  escolas: EscolaDoUsuario[];
  escolaId: string | null;
  nomeEscola: string | null;
  cargo: Cargo | null;
};

const cache = new Map<string, { email: string | null; escolas: EscolaDoUsuario[]; ate: number }>();
const UM_MINUTO = 60_000;

/** Chamar depois de qualquer alteracao de acesso (tela Usuarios, cadastro de professor). */
export function limparCacheAcessos(): void {
  cache.clear();
}

export async function escolasDoEmail(email: string): Promise<EscolaDoUsuario[]> {
  const equipe = await db
    .select({ escolaId: acessosEscolaTable.escolaId, cargo: acessosEscolaTable.cargo })
    .from(acessosEscolaTable)
    .where(and(eq(acessosEscolaTable.email, email), eq(acessosEscolaTable.ativo, true)));
  const prof = await db
    .selectDistinct({ escolaId: professoresTable.escolaId })
    .from(professoresTable)
    .where(and(sql`lower(trim(${professoresTable.email})) = ${email}`, eq(professoresTable.ativo, true)));

  const porEscola = new Map<string, Cargo>();
  for (const p of prof) porEscola.set(p.escolaId, "professor");
  for (const e of equipe) porEscola.set(e.escolaId, e.cargo as Cargo); // equipe vale mais
  if (porEscola.size === 0) return [];

  const nomes = await db
    .select({ id: escolasTable.id, nome: escolasTable.nomeFantasia })
    .from(escolasTable)
    .where(inArray(escolasTable.id, [...porEscola.keys()]));
  const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
  return [...porEscola.entries()]
    .filter(([id]) => nomePorId.has(id)) // escola que nao existe mais nao aparece
    .map(([escolaId, cargo]) => ({ escolaId, cargo, nome: nomePorId.get(escolaId)! }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function escolasDoUsuario(req: Request, userId: string) {
  const c = cache.get(userId);
  if (c && c.ate > Date.now()) return c;
  const email = await emailVerificado(req);
  const escolas = email ? await escolasDoEmail(email) : [];
  if (email && escolas.length) {
    // primeiro login (ou login com outra conta do mesmo e-mail): grava o id e a data
    await db
      .update(acessosEscolaTable)
      .set({ userId, ultimoAcessoEm: new Date() })
      .where(and(eq(acessosEscolaTable.email, email), eq(acessosEscolaTable.ativo, true)))
      .catch(() => undefined);
  }
  const novo = { email, escolas, ate: Date.now() + UM_MINUTO };
  cache.set(userId, novo);
  return novo;
}

/** Middleware: com a chave ligada, descobre escola e cargo e guarda em req.acesso. */
export async function carregarAcesso(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!acessosPeloBanco()) return next();
  const userId = usuarioLogado(req);
  if (!userId) return next();
  try {
    const { email, escolas } = await escolasDoUsuario(req, userId);
    const pedida = req.header("x-escola-id")?.trim();
    let atual: EscolaDoUsuario | undefined;
    if (pedida) {
      atual = escolas.find((e) => e.escolaId === pedida);
      if (!atual) {
        res.status(403).json({ error: "Você não tem acesso a esta escola.", codigo: "ESCOLA_SEM_ACESSO" });
        return;
      }
    } else {
      atual = escolas[0];
    }
    const acesso: Acesso = {
      userId,
      email,
      escolas,
      escolaId: atual?.escolaId ?? null,
      nomeEscola: atual?.nome ?? null,
      cargo: atual?.cargo ?? null,
    };
    (req as Request & { acesso?: Acesso }).acesso = acesso;
    next();
  } catch (err) {
    next(err);
  }
}

export function acessoDe(req: Request): Acesso | undefined {
  return (req as Request & { acesso?: Acesso }).acesso;
}

export function temAcessoTotal(req: Request): boolean {
  const a = acessoDe(req);
  return !!a?.cargo && CARGOS_TOTAIS.has(a.cargo);
}
