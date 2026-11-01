// [ARQUIVO-RCO] (26/10/2026) A escola envia o arquivo de exportacao da Grade de Horario do RCO
// quando a Nexus Core pede (Painel Master). Enviar e da coordenacao/direcao/secretaria (o filtro
// unico de permissao, lib/permissao.ts, ja barra alteracao de quem nao e). Ver lib/arquivo-rco.ts.
import express, { Router } from "express";
import { getEscolaId } from "../lib/escola-id";
import { emailVerificado } from "../lib/identidade";
import { registrarAuditoria } from "../lib/audit";
import { lerExportacaoRco, resumirExportacaoRco } from "../lib/rco-exportacao";
import { situacaoArquivoRco, guardarArquivoRco, conteudoArquivoRco } from "../lib/arquivo-rco";

const router = Router();
const LIMITE = "5mb";

router.get("/", async (req, res) => {
  const s = await situacaoArquivoRco(getEscolaId(req));
  res.json({ solicitado: s.solicitado ? { em: s.solicitado.em, mensagem: s.solicitado.mensagem } : null, enviado: s.enviado, importado: s.importado });
});

// corpo = o XML cru (Content-Type application/xml ou text/xml ou text/plain); ?nome=<nome do arquivo>
router.post("/", express.text({ type: () => true, limit: LIMITE }), async (req, res) => {
  const escolaId = getEscolaId(req);
  const xml = typeof req.body === "string" ? req.body : "";
  const exportacao = xml ? lerExportacaoRco(xml) : null;
  if (!exportacao) {
    res.status(400).json({
      error: "Este arquivo não é a exportação da Grade de Horário do RCO. Baixe de novo no RCO (Grade de Horário) e envie o arquivo .XML sem alterar.",
    });
    return;
  }
  const nomeArquivo = String(req.query.nome ?? "exportacao-rco.xml").replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "exportacao-rco.xml";
  const resumo = resumirExportacaoRco(exportacao);
  const envio = { nomeArquivo, enviadoEm: new Date().toISOString(), enviadoPor: await emailVerificado(req), resumo, tamanho: xml.length };
  await guardarArquivoRco(escolaId, envio, xml);
  await registrarAuditoria({ req, escolaId, entidade: "arquivo_rco", entidadeId: 0, acao: "criacao", dadosAnteriores: null, dadosNovos: { nomeArquivo, resumo } }).catch(() => undefined);
  res.status(201).json({ ok: true, enviado: envio });
});

router.get("/baixar", async (req, res) => {
  const c = await conteudoArquivoRco(getEscolaId(req));
  if (!c) { res.status(404).json({ error: "A escola ainda não enviou o arquivo do RCO." }); return; }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${c.nomeArquivo}"`);
  res.send(c.xml);
});

export default router;
