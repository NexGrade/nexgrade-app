import { Router } from "express";
import { ehPlanoPago } from "../lib/preco-plano"; // [PRECO-POR-TURMA]
import { db } from "@workspace/db";
import { escolasTable, planosTable, cursosTable } from "@workspace/db";
import { semearCatalogoEscola, listarModelosCatalogo, chaveCurso } from "../lib/semear-catalogo"; // [CATALOGO]
import { and, eq, sql } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { limitadorConsultaSensivel } from "../middlewares/rateLimit";
import { registrarAuditoria } from "../lib/audit";
import { MATRIZES_TECNICAS_SEED_PR_2026 } from "../lib/matrizes-tecnicas-seed-pr";
import { MATRIZES_OFICIAIS_SEED_PR } from "../lib/matrizes-oficiais-seed-pr";

// RNF-SEG: essas duas listas (matrizes curriculares oficiais SEED-PR,
// ~5.400 linhas de dado curado a partir de PDFs regulatórios) antes
// viviam em src/lib/*.ts do FRONTEND -- ou seja, iam dentro do
// pacote JS público, baixado por QUALQUER pessoa que criasse uma
// conta gratuita, sem checagem de plano nenhuma. Agora ficam só aqui
// no backend, com três camadas de proteção:
//  1) só sai pra quem está autenticado E dentro do trial OU com plano
//     pago OU marcado como isento (ver checarAcessoMatrizes abaixo);
//  2) rate limit específico, mais apertado que o geral;
//  3) toda consulta bem-sucedida fica registrada na auditoria, pra dar
//     rastreabilidade se um vazamento aparecer algum dia.
const router = Router();

// [NOVO] Conta gratuita permanente (trial já vencido, sem plano pago)
// não acessa mais o catálogo oficial completo -- só quem está em
// avaliação (trial ainda válido), pagando, ou explicitamente isento
// (ex: escola piloto). Isso evita que alguém crie uma conta e fique
// com acesso permanente e gratuito ao catálogo inteiro pra sempre,
// sem travar quem está legitimamente avaliando o produto.
async function checarAcessoMatrizes(escolaId: string): Promise<boolean> {
  const escola = await db.select().from(escolasTable).where(eq(escolasTable.id, escolaId)).then((r) => r[0]);
  if (!escola) return false;
  if (escola.isenta) return true;
  if (escola.trialEndsAt && new Date(escola.trialEndsAt) > new Date()) return true;
  if (escola.planoId) {
    const plano = await db.select().from(planosTable).where(eq(planosTable.id, escola.planoId)).then((r) => r[0]);
    if (plano && ehPlanoPago(plano)) return true; // [PRECO-POR-TURMA]
  }
  return false;
}

router.get("/tecnicas", limitadorConsultaSensivel, async (req, res) => {
  const escolaId = getEscolaId(req);
  if (!(await checarAcessoMatrizes(escolaId))) {
    res.status(403).json({
      error: "Catálogo de matrizes oficiais disponível só durante o período de avaliação ou em planos pagos.",
      dica: "Veja os planos disponíveis em /planos.",
    });
    return;
  }
  await registrarAuditoria({
    req, escolaId, entidade: "matrizes-oficiais", entidadeId: 0,
    acao: "consulta", dadosAnteriores: null, dadosNovos: { tipo: "tecnicas" },
  });
  res.json(MATRIZES_TECNICAS_SEED_PR_2026);
});

router.get("/gerais", limitadorConsultaSensivel, async (req, res) => {
  const escolaId = getEscolaId(req);
  if (!(await checarAcessoMatrizes(escolaId))) {
    res.status(403).json({
      error: "Catálogo de matrizes oficiais disponível só durante o período de avaliação ou em planos pagos.",
      dica: "Veja os planos disponíveis em /planos.",
    });
    return;
  }
  await registrarAuditoria({
    req, escolaId, entidade: "matrizes-oficiais", entidadeId: 0,
    acao: "consulta", dadosAnteriores: null, dadosNovos: { tipo: "gerais" },
  });
  res.json(MATRIZES_OFICIAIS_SEED_PR);
});

// [CATALOGO-SOB-DEMANDA] (28/10/2026) Cursos do catalogo oficial com a situacao na escola.
// Nada e gravado: o catalogo fica nos modelos do codigo ate a escola ofertar um curso.
// Cursos proprios da escola (fora do catalogo) vem em `proprios`.
router.get("/catalogo-cursos", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursos = await db.select().from(cursosTable).where(eq(cursosTable.escolaId, escolaId));
  const porChave = new Map(cursos.map((c) => [chaveCurso(c.nome, (c as any).formaOferta), c] as const));
  const usados = new Set<number>();
  const modelos = listarModelosCatalogo().map((m) => {
    const c = porChave.get(m.chave);
    if (c) usados.add(c.id);
    return { ...m, cursoId: c?.id ?? null, ofertado: c ? (c as any).ofertado !== false : false };
  });
  const proprios = cursos.filter((c) => !usados.has(c.id)).map((c) => ({
    cursoId: c.id, nome: c.nome, nivel: c.nivel, codigoCurso: (c as any).codigoCurso ?? null,
    formaOferta: (c as any).formaOferta ?? null, ofertado: (c as any).ofertado !== false,
  }));
  res.json({ modelos, proprios });
});

// [CATALOGO-SOB-DEMANDA] Oferta um curso do catalogo: cria o curso (ja ofertado) com as
// matrizes e so as disciplinas dele. Se o curso ja existe, religa e completa as series que faltam.
router.post("/catalogo-cursos/ofertar", async (req, res) => {
  const escolaId = getEscolaId(req);
  const chave = typeof req.body?.chave === "string" ? req.body.chave : "";
  if (!listarModelosCatalogo().some((m) => m.chave === chave)) {
    res.status(400).json({ error: "Curso não encontrado no catálogo oficial." });
    return;
  }
  if (!(await checarAcessoMatrizes(escolaId))) {
    res.status(403).json({ error: "Catálogo de matrizes oficiais disponível só durante o período de avaliação ou em planos pagos." });
    return;
  }
  try {
    const resultado = await semearCatalogoEscola(escolaId, { chaves: [chave], ofertar: true });
    await registrarAuditoria({
      req, escolaId, entidade: "matrizes-oficiais", entidadeId: 0,
      acao: "alteracao", dadosAnteriores: null, dadosNovos: { tipo: "ofertar-curso", chave, ...resultado },
    });
    res.json(resultado);
  } catch (err: any) {
    console.error("[catalogo] falha ao ofertar curso", escolaId, chave, err);
    res.status(500).json({ error: "Não foi possível trazer o curso do catálogo. Tente novamente." });
  }
});

// [DISC-EM-USO] Disciplinas que a escola usa: em alguma turma, na matriz de um curso
// ofertado, ou avulsas (criadas a mao / fora de qualquer matriz da escola).
router.get("/disciplinas-em-uso", async (req, res) => {
  const escolaId = getEscolaId(req);
  const r: any = await db.execute(sql`
    select d.id from disciplinas d
    where d.escola_id = ${escolaId} and (
      exists (select 1 from turma_disciplinas td join turmas t on t.id = td.turma_id
              where td.disciplina_id = d.id and t.escola_id = ${escolaId})
      or exists (select 1 from itens_matriz i join matrizes_curriculares m on m.id = i.matriz_curricular_id
                 join cursos c on c.id = m.curso_id
                 where i.disciplina_id = d.id and c.escola_id = ${escolaId} and c.ofertado)
      or not exists (select 1 from itens_matriz i join matrizes_curriculares m on m.id = i.matriz_curricular_id
                     where i.disciplina_id = d.id and m.escola_id = ${escolaId})
    )`);
  const linhas = (r?.rows ?? r ?? []) as any[];
  res.json(linhas.map((x) => Number(x.id)));
});
// [CATALOGO] Liga/desliga a oferta de um curso da escola.
router.patch("/cursos/:id/ofertado", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const ofertado = req.body?.ofertado === true;
  const [curso] = await db.update(cursosTable).set({ ofertado } as any)
    .where(and(eq(cursosTable.id, id), eq(cursosTable.escolaId, escolaId))).returning();
  if (!curso) { res.status(404).json({ error: "Curso não encontrado" }); return; }
  res.json(curso);
});

export default router;
