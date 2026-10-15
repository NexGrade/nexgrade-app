// [NOVA-ESCOLA-MASTER] (15/10/2026) POST /api/master/escolas -- a Nexus Core cadastra uma
// escola nova pelo Painel Master (decisao de 15/10: escola nova so por aqui).
// A escola nasce como no antigo cadastro pela propria escola: plano Gratuito, 30 dias de
// avaliacao e o catalogo oficial SEED-PR. Com ACESSOS_PELO_BANCO=1, o e-mail da direcao
// ja fica liberado (acessos_escola) e a pessoa entra no NexGrade com ele.
// So o Master chega aqui (requireMaster em routes/master.ts).
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, escolasTable, planosTable, acessosEscolaTable } from "@workspace/db";
import { eq, or, and, isNotNull } from "drizzle-orm";
import { semearCatalogoEscola } from "../lib/semear-catalogo";
import { registrarAuditoria } from "../lib/audit";
import { limparCacheAcessos, acessosPeloBanco } from "../lib/acesso";
import { emailVerificado, normalizarEmail } from "../lib/identidade";

const router = Router();

const soDigitos = (v: string) => v.replace(/\D/g, "");
const TURNOS = ["matutino", "vespertino", "noturno"] as const;

const NovaEscolaInput = z.object({
  nomeFantasia: z.string().trim().min(3, "Informe o nome da escola."),
  cnpj: z.string().trim().refine((v) => soDigitos(v).length === 14, "CNPJ precisa ter 14 números."),
  codigoInep: z.string().trim().refine((v) => !v || soDigitos(v).length === 8, "Código INEP precisa ter 8 números.").optional(),
  cidade: z.string().trim().min(2, "Informe a cidade."),
  estado: z.string().trim().length(2).default("PR"),
  nre: z.string().trim().optional(),
  turnosOfertados: z.array(z.enum(TURNOS)).min(1, "Marque pelo menos um turno."),
  emailContato: z.string().trim().email("E-mail de contato inválido.").optional().or(z.literal("")),
  telefoneContato: z.string().trim().optional(),
  direcaoNome: z.string().trim().min(2, "Informe o nome da direção."),
  direcaoEmail: z.string().trim().email("E-mail da direção inválido."),
  incluirMe: z.boolean().default(true),
  isenta: z.boolean().default(false),
});

router.post("/escolas", async (req, res) => {
  const parsed = NovaEscolaInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  const d = parsed.data;
  const cnpj = soDigitos(d.cnpj);
  const inep = d.codigoInep ? soDigitos(d.codigoInep) : null;

  // mesma escola cadastrada duas vezes (CNPJ ou INEP)
  const repetida = await db
    .select({ nome: escolasTable.nomeFantasia, cnpj: escolasTable.cnpj, inep: escolasTable.codigoInep })
    .from(escolasTable)
    .where(or(eq(escolasTable.cnpj, cnpj), inep ? and(isNotNull(escolasTable.codigoInep), eq(escolasTable.codigoInep, inep)) : undefined));
  if (repetida.length) {
    res.status(409).json({ error: "Já existe uma escola com este " + (repetida[0]!.cnpj === cnpj ? "CNPJ" : "código INEP") + ": " + repetida[0]!.nome + "." });
    return;
  }

  let planoGratuito = await db.select().from(planosTable).where(eq(planosTable.nome, "Gratuito")).then((r) => r[0]);
  if (!planoGratuito) {
    [planoGratuito] = await db
      .insert(planosTable)
      .values({ nome: "Gratuito", precoMensal: 0, maxProfessores: 10, maxTurmas: 5, temIA: false, temExport: true, temImport: false, ativo: true })
      .returning();
  }

  const escolaId = "esc_" + randomUUID().replace(/-/g, "").slice(0, 24);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);
  const masterEmail = d.incluirMe ? await emailVerificado(req) : null;
  const direcaoEmail = normalizarEmail(d.direcaoEmail);

  const escola = await db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(escolasTable)
      .values({
        id: escolaId,
        nomeFantasia: d.nomeFantasia,
        cnpj,
        codigoInep: inep,
        cidade: d.cidade,
        estado: d.estado.toUpperCase(),
        modalidade: "regular",
        nre: d.nre || null,
        turnosOfertados: d.turnosOfertados.join(","),
        emailContato: d.emailContato || null,
        telefoneContato: d.telefoneContato || null,
        planoId: planoGratuito!.id,
        planoAtivo: true,
        trialEndsAt,
        isenta: d.isenta,
      })
      .returning();
    await tx.insert(acessosEscolaTable).values({ escolaId, email: direcaoEmail, nome: d.direcaoNome, cargo: "direcao", criadoPor: "painel-master" });
    if (masterEmail && masterEmail !== direcaoEmail) {
      await tx.insert(acessosEscolaTable).values({ escolaId, email: masterEmail, nome: "Nexus Core (suporte)", cargo: "coordenacao", criadoPor: "painel-master" });
    }
    return criada!;
  });
  limparCacheAcessos();

  // catalogo oficial SEED-PR (cursos desligados ate a escola marcar quais oferta)
  let catalogo = "Catálogo oficial SEED-PR carregado.";
  try {
    await semearCatalogoEscola(escolaId);
  } catch (err) {
    console.error("[nova-escola] falha ao semear o catalogo", escolaId, err);
    catalogo = "ATENÇÃO: o catálogo oficial não foi carregado; abra Cursos e Disciplinas na escola e use \"Importar catálogo oficial SEED-PR\".";
  }

  await registrarAuditoria({ req, escolaId, entidade: "escolas", entidadeId: 0, acao: "criacao", dadosAnteriores: null, dadosNovos: escola }).catch(() => undefined);

  res.status(201).json({
    ok: true,
    escola,
    mensagem:
      d.nomeFantasia + " cadastrada. " + catalogo +
      (acessosPeloBanco()
        ? " A direção (" + direcaoEmail + ") já pode entrar em nexgrade.nexuscoretecnologia.com.br com esse e-mail."
        : " ATENÇÃO: com ACESSOS_PELO_BANCO desligado, a direção só entra pelo convite do Clerk."),
  });
});

// [MASTER-SUPORTE] (15/10/2026) POST /api/master/escolas/:id/meu-acesso -- a Nexus Core so
// entra numa escola com um acesso VISIVEL para a escola (Usuarios: "Nexus Core (suporte)",
// cargo coordenacao), que a propria escola pode remover. Nunca ha acesso escondido.
router.post("/escolas/:id/meu-acesso", async (req, res) => {
  if (!acessosPeloBanco()) {
    res.status(409).json({ error: "Disponível só com ACESSOS_PELO_BANCO ligado." });
    return;
  }
  const escolaId = String(req.params.id);
  const escola = await db.select({ id: escolasTable.id, nome: escolasTable.nomeFantasia }).from(escolasTable).where(eq(escolasTable.id, escolaId)).then((r) => r[0]);
  if (!escola) {
    res.status(404).json({ error: "Escola não encontrada." });
    return;
  }
  const email = await emailVerificado(req);
  if (!email) {
    res.status(400).json({ error: "Sua conta não tem e-mail verificado." });
    return;
  }
  const [existente] = await db
    .select()
    .from(acessosEscolaTable)
    .where(and(eq(acessosEscolaTable.escolaId, escolaId), eq(acessosEscolaTable.email, email)));
  if (existente?.ativo) {
    res.json({ ok: true, mensagem: "Você já tem acesso a " + escola.nome + "." });
    return;
  }
  if (existente) {
    await db.update(acessosEscolaTable).set({ ativo: true, cargo: "coordenacao", criadoPor: "painel-master" }).where(eq(acessosEscolaTable.id, existente.id));
  } else {
    await db.insert(acessosEscolaTable).values({ escolaId, email, nome: "Nexus Core (suporte)", cargo: "coordenacao", criadoPor: "painel-master" });
  }
  limparCacheAcessos();
  await registrarAuditoria({
    req, escolaId, entidade: "acessos_escola", entidadeId: 0, acao: "criacao",
    dadosAnteriores: existente ?? null, dadosNovos: { email, cargo: "coordenacao", motivo: "suporte Nexus Core" },
  }).catch(() => undefined);
  res.status(201).json({ ok: true, mensagem: "Acesso de suporte liberado em " + escola.nome + ". Ele aparece em Usuários da escola como \"Nexus Core (suporte)\"." });
});

export default router;
