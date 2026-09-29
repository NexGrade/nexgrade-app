import { Router } from "express";
import { db } from "@workspace/db";
import { escolasTable, planosTable, cursosTable } from "@workspace/db";
import { semearCatalogoEscola } from "../lib/semear-catalogo"; // [CATALOGO]
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
    if (plano && plano.precoMensal > 0) return true;
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

// [CATALOGO] Importa o catalogo oficial completo para a escola (cursos, matrizes,
// disciplinas e cargas). Seguro para repetir: nada existente e alterado.
router.post("/semear", async (req, res) => {
  const escolaId = getEscolaId(req);
  if (!(await checarAcessoMatrizes(escolaId))) {
    res.status(403).json({ error: "Catálogo de matrizes oficiais disponível só durante o período de avaliação ou em planos pagos." });
    return;
  }
  try {
    const resultado = await semearCatalogoEscola(escolaId);
    await registrarAuditoria({
      req, escolaId, entidade: "matrizes-oficiais", entidadeId: 0,
      acao: "alteracao", dadosAnteriores: null, dadosNovos: { tipo: "semear", ...resultado },
    });
    res.json(resultado);
  } catch (err: any) {
    console.error("[catalogo] falha ao semear", escolaId, err);
    res.status(500).json({ error: "Não foi possível importar o catálogo. Tente novamente." });
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
