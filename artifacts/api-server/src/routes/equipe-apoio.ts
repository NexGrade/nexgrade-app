// [EQUIPE-APOIO] (12/11/2026) Cadastro da equipe de apoio que assina o Ponto Diario (pedagogos, PAEE,
// interpretes, PAC e Sala de Recursos). Montado em /pedagogia/equipe-apoio, entao vale a regra da area
// /pedagogia (lib/permissao.ts): ler e alterar so direcao, coordenacao, secretaria e pedagogia; o
// professor nao le nem grava.
//  GET    /pedagogia/equipe-apoio        lista da escola (+ migracaoPendente quando a tabela nao existe)
//  POST   /pedagogia/equipe-apoio        cadastra
//  PUT    /pedagogia/equipe-apoio/:id    altera
//  DELETE /pedagogia/equipe-apoio/:id    remove
// Sem a migracao (tabela equipe_apoio) a lista abre vazia e o salvar avisa.
import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, equipeApoioTable } from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";
import { EquipeApoioInput, semTabelaEquipe } from "../lib/equipe-apoio";

const router = Router();
const MSG_MIGRACAO = "O cadastro da equipe de apoio ainda não está disponível nesta escola: falta atualizar o banco de dados. Avise o suporte do NexGrade.";

function erroValidacao(e: { issues: Array<{ message: string }> }): string {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  try {
    const pessoas = await db.select().from(equipeApoioTable).where(eq(equipeApoioTable.escolaId, escolaId)).orderBy(asc(equipeApoioTable.nome));
    res.json({ pessoas, migracaoPendente: false });
  } catch (e) {
    if (semTabelaEquipe(e)) { res.json({ pessoas: [], migracaoPendente: true }); return; }
    throw e;
  }
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const p = EquipeApoioInput.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: erroValidacao(p.error) }); return; }
  try {
    const [pessoa] = await db.insert(equipeApoioTable).values({ ...p.data, escolaId }).returning();
    res.status(201).json(pessoa);
  } catch (e) {
    if (semTabelaEquipe(e)) { res.status(503).json({ error: MSG_MIGRACAO }); return; }
    throw e;
  }
});

router.put("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Cadastro inválido." }); return; }
  const p = EquipeApoioInput.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: erroValidacao(p.error) }); return; }
  try {
    const [pessoa] = await db.update(equipeApoioTable).set(p.data)
      .where(and(eq(equipeApoioTable.id, id), eq(equipeApoioTable.escolaId, escolaId))).returning();
    if (!pessoa) { res.status(404).json({ error: "Pessoa não encontrada." }); return; }
    res.json(pessoa);
  } catch (e) {
    if (semTabelaEquipe(e)) { res.status(503).json({ error: MSG_MIGRACAO }); return; }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Cadastro inválido." }); return; }
  try {
    await db.delete(equipeApoioTable).where(and(eq(equipeApoioTable.id, id), eq(equipeApoioTable.escolaId, escolaId)));
    res.status(204).send();
  } catch (e) {
    if (semTabelaEquipe(e)) { res.status(503).json({ error: MSG_MIGRACAO }); return; }
    throw e;
  }
});

export default router;
