// [VIRADA-ANO] (24/10/2026) Virada do ano letivo. Leitura e escrita so para direcao, coordenacao e
// secretaria (lib/permissao.ts: "/virada-ano" e leitura so de admin; escrita ja e so dos cargos totais).
import { Router } from "express";
import { getEscolaId } from "../lib/escola-id";
import { acessoDe } from "../lib/acesso";
import { registrarAuditoria } from "../lib/audit";
import { desfazerVirada, executarVirada, previaVirada, situacaoVirada } from "../lib/virada-ano";

const router = Router();

router.get("/situacao", async (req, res) => {
  res.json(await situacaoVirada(getEscolaId(req)));
});

router.get("/previa", async (req, res) => {
  res.json(await previaVirada(getEscolaId(req)));
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const r = await executarVirada(escolaId, req.body, acessoDe(req)?.email ?? null);
  if (r.status === 201) {
    await registrarAuditoria({ req, escolaId, entidade: "virada_ano", entidadeId: 0, acao: "criacao", dadosAnteriores: null, dadosNovos: r.body.resumo }).catch(() => undefined);
  }
  res.status(r.status).json(r.body);
});

router.post("/desfazer", async (req, res) => {
  const escolaId = getEscolaId(req);
  const r = await desfazerVirada(escolaId);
  if (r.status === 200) {
    await registrarAuditoria({ req, escolaId, entidade: "virada_ano", entidadeId: 0, acao: "exclusao", dadosAnteriores: null, dadosNovos: r.body }).catch(() => undefined);
  }
  res.status(r.status).json(r.body);
});

export default router;
