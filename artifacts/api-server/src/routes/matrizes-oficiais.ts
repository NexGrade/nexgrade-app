import { Router } from "express";
import { db } from "@workspace/db";
import { escolasTable, planosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
