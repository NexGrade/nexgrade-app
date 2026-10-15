// [ACESSOS-ESCOLA] (15/10/2026) Tela Usuarios com ACESSOS_PELO_BANCO=1: a equipe da escola
// (direcao, coordenacao, secretaria, reservas) fica na tabela acessos_escola, sem convite
// do Clerk e sem limite de pessoas. Professor nao entra aqui: basta o e-mail no cadastro
// de Professores. Mesmas rotas e formato de resposta da versao Clerk (usuarios-acessos.ts),
// para a tela atual continuar funcionando; o "id" passa a ser o numero da linha.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db, acessosEscolaTable } from "@workspace/db";
import { and, eq, ne, inArray, count } from "drizzle-orm";
import { acessoDe, temAcessoTotal, limparCacheAcessos, ROTULO_CARGO, CARGOS_TOTAIS, type Cargo } from "../lib/acesso";
import { normalizarEmail } from "../lib/identidade";

const router = Router();
const CargoEquipe = z.enum(["direcao", "coordenacao", "secretaria", "reservas"]);
const ENDERECO = "nexgrade.nexuscoretecnologia.com.br";
const MSG_PROFESSOR = "Professor não precisa de convite: cadastre o e-mail dele em Professores e ele já consegue entrar.";
const MSG_ULTIMO = "A escola precisa manter pelo menos uma pessoa da direção, da coordenação ou da secretaria.";

function contexto(req: Request, res: Response): { escolaId: string; email: string | null; userId: string } | null {
  const a = acessoDe(req);
  if (!a?.escolaId) { res.status(403).json({ error: "Seu e-mail ainda não foi liberado em nenhuma escola." }); return null; }
  if (!temAcessoTotal(req)) { res.status(403).json({ error: "Apenas a direção, a coordenação ou a secretaria podem gerenciar usuários." }); return null; }
  return { escolaId: a.escolaId, email: a.email, userId: a.userId };
}

async function linhaDaEscola(escolaId: string, idBruto: string) {
  const id = Number(idBruto);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [l] = await db
    .select()
    .from(acessosEscolaTable)
    .where(and(eq(acessosEscolaTable.id, id), eq(acessosEscolaTable.escolaId, escolaId), eq(acessosEscolaTable.ativo, true)));
  return l ?? null;
}

/** true se, tirando a linha `semId`, ainda sobra alguem com acesso total ativo */
async function sobraAcessoTotal(escolaId: string, semId: number): Promise<boolean> {
  const [r] = await db
    .select({ n: count() })
    .from(acessosEscolaTable)
    .where(and(
      eq(acessosEscolaTable.escolaId, escolaId),
      eq(acessosEscolaTable.ativo, true),
      inArray(acessosEscolaTable.cargo, [...CARGOS_TOTAIS]),
      ne(acessosEscolaTable.id, semId),
    ));
  return (r?.n ?? 0) > 0;
}

router.get("/", async (req, res) => {
  const ctx = contexto(req, res);
  if (!ctx) return;
  const linhas = await db
    .select()
    .from(acessosEscolaTable)
    .where(and(eq(acessosEscolaTable.escolaId, ctx.escolaId), eq(acessosEscolaTable.ativo, true)));
  const itens = linhas
    .map((l) => ({
      // "convite" = ainda nao entrou nenhuma vez (a tela mostra "Convite pendente")
      tipo: (l.userId ? "membro" : "convite") as "membro" | "convite",
      id: String(l.id),
      nome: l.nome || l.email,
      email: l.email,
      cargo: l.cargo,
      rotuloCargo: ROTULO_CARGO[l.cargo as Cargo] ?? l.cargo,
      papel: "banco",
      ehVoce: !!ctx.email && l.email === ctx.email,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  res.json(itens);
});

router.post("/convites", async (req, res) => {
  const ctx = contexto(req, res);
  if (!ctx) return;
  const parsed = z.object({
    nome: z.string().trim().min(2, "Informe o nome."),
    email: z.string().trim().email("E-mail inválido."),
    cargo: z.string(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }); return; }
  if (parsed.data.cargo === "professor") { res.status(422).json({ error: MSG_PROFESSOR }); return; }
  const cargo = CargoEquipe.safeParse(parsed.data.cargo);
  if (!cargo.success) { res.status(400).json({ error: "Cargo inválido." }); return; }
  const email = normalizarEmail(parsed.data.email);
  const nome = parsed.data.nome;

  const [existente] = await db
    .select()
    .from(acessosEscolaTable)
    .where(and(eq(acessosEscolaTable.escolaId, ctx.escolaId), eq(acessosEscolaTable.email, email)));
  if (existente?.ativo) {
    res.status(409).json({ error: "Este e-mail já tem acesso à escola. Para mudar o cargo, use a lista." });
    return;
  }
  if (existente) {
    await db
      .update(acessosEscolaTable)
      .set({ ativo: true, cargo: cargo.data, nome, criadoPor: ctx.userId })
      .where(eq(acessosEscolaTable.id, existente.id));
  } else {
    await db.insert(acessosEscolaTable).values({ escolaId: ctx.escolaId, email, nome, cargo: cargo.data, criadoPor: ctx.userId });
  }
  limparCacheAcessos();
  res.status(201).json({
    ok: true,
    mensagem: "Acesso liberado para " + email + " como " + ROTULO_CARGO[cargo.data] + ". A pessoa entra em " + ENDERECO + " com esse e-mail (ou pelo botão \"Entrar com Google\").",
  });
});

router.patch("/membros/:id", async (req, res) => {
  const ctx = contexto(req, res);
  if (!ctx) return;
  const parsed = z.object({ cargo: z.string() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Cargo inválido." }); return; }
  if (parsed.data.cargo === "professor") {
    res.status(422).json({ error: "Para deixar a pessoa só como professor, remova o acesso dela aqui: com o e-mail no cadastro de Professores, ela continua entrando na Minha Agenda." });
    return;
  }
  const cargo = CargoEquipe.safeParse(parsed.data.cargo);
  if (!cargo.success) { res.status(400).json({ error: "Cargo inválido." }); return; }
  const linha = await linhaDaEscola(ctx.escolaId, String(req.params.id));
  if (!linha) { res.status(404).json({ error: "Acesso não encontrado." }); return; }
  if (ctx.email && linha.email === ctx.email) { res.status(400).json({ error: "Você não pode alterar o seu próprio cargo." }); return; }
  if (CARGOS_TOTAIS.has(linha.cargo) && !CARGOS_TOTAIS.has(cargo.data) && !(await sobraAcessoTotal(ctx.escolaId, linha.id))) {
    res.status(422).json({ error: MSG_ULTIMO });
    return;
  }
  await db.update(acessosEscolaTable).set({ cargo: cargo.data }).where(eq(acessosEscolaTable.id, linha.id));
  limparCacheAcessos();
  res.json({ ok: true, mensagem: "Cargo alterado para " + ROTULO_CARGO[cargo.data] + "." });
});

async function remover(req: Request, res: Response) {
  const ctx = contexto(req, res);
  if (!ctx) return;
  const linha = await linhaDaEscola(ctx.escolaId, String(req.params.id));
  if (!linha) { res.status(404).json({ error: "Acesso não encontrado." }); return; }
  if (ctx.email && linha.email === ctx.email) { res.status(400).json({ error: "Você não pode remover o seu próprio acesso." }); return; }
  if (CARGOS_TOTAIS.has(linha.cargo) && !(await sobraAcessoTotal(ctx.escolaId, linha.id))) {
    res.status(422).json({ error: MSG_ULTIMO });
    return;
  }
  // desativa em vez de apagar: o historico de quem teve acesso fica guardado
  await db.update(acessosEscolaTable).set({ ativo: false }).where(eq(acessosEscolaTable.id, linha.id));
  limparCacheAcessos();
  res.json({ ok: true, mensagem: "Acesso removido." });
}
router.delete("/membros/:id", remover);
router.delete("/convites/:id", remover);

// nada da versao Clerk deve rodar com a chave ligada
router.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

export default router;
