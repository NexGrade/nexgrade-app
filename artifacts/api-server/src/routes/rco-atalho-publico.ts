// [RCO-ATALHO] (31/10/2026) Rota PUBLICA (sem login do NexGrade) que o favorito "Gravar no RCO" carrega
// por <script src> dentro da tela do RCO. Quem autoriza e a chave da escola no endereco (ver
// lib/rco-atalho.ts). Responde sempre JavaScript: o script de gravacao (todas as turmas do turno, com
// previa e confirmacao) ou um alert com o motivo de nao gravar.
import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { escolaDaChave, marcarUsoDoAtalho, scriptDeAviso } from "../lib/rco-atalho";
import { scriptRcoDaEscola } from "./export";
import { logger } from "../lib/logger";

const router = Router();

router.use(rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "0.0.0.0"),
  handler: (_req, res) => {
    res.status(429).type("application/javascript").send(scriptDeAviso("muitas tentativas seguidas. Espere um minuto e clique de novo."));
  },
}));

router.get("/:arquivo", async (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const chave = req.params.arquivo.replace(/\.js$/, "");
  const turno = typeof req.query.turno === "string" ? req.query.turno : "";
  const escolaId = await escolaDaChave(chave);
  if (!escolaId) {
    res.status(404).send(scriptDeAviso("este atalho não vale mais (a chave foi trocada). Pegue o atalho novo no NexGrade, em Exportar para o RCO."));
    return;
  }
  try {
    const r = await scriptRcoDaEscola(escolaId, turno, false);
    if ("erro" in r) {
      res.send(scriptDeAviso(`nada foi gravado. ${String(r.erro.error ?? "")} Veja os detalhes no NexGrade, em Exportar para o RCO.`));
      return;
    }
    await marcarUsoDoAtalho(escolaId).catch(() => {});
    logger.info({ escolaId, turno }, "[RCO-ATALHO] script carregado pelo favorito");
    res.send(r.js);
  } catch (e) {
    logger.error({ err: e, escolaId, turno }, "[RCO-ATALHO] erro ao montar o script");
    res.status(500).send(scriptDeAviso("erro ao montar a gravação. Tente de novo; se continuar, chame o suporte NexGrade."));
  }
});

export default router;
