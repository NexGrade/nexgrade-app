// [LIMITE-DISCIPLINA] (01/11/2026) Tela Regras de Distribuição:
//  GET  /regras-distribuicao                 padrão da rede, limites por disciplina da escola, disciplinas
//                                            com aula na escola e as exceções por turma já configuradas
//  PUT  /regras-distribuicao/por-disciplina  grava os limites por disciplina ({ limites: { [id]: n | null } })
//  DELETE /regras-distribuicao/excecao/:turmaId/:disciplinaId  tira a excecao da turma (volta ao limite da disciplina)
// Alterar é só da direção, coordenação e secretaria (filtro único, lib/permissao.ts).
import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, configuracoesTable, disciplinasTable, turmasTable, turmaDisciplinasTable } from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";
import { REGRAS_REDE } from "../lib/regras-rede";
import { CHAVE_LIMITE_DISCIPLINA, LIMITE_MAX, LIMITE_MIN, carregarLimitesPorDisciplina } from "../lib/limite-disciplina";

const router = Router();

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const [limites, turmas, disciplinas] = await Promise.all([
    carregarLimitesPorDisciplina(escolaId),
    db.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome }).from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
  ]);
  const turmaIds = turmas.map((t) => t.id);
  const vinculos = turmaIds.length
    ? await db.select({ turmaId: turmaDisciplinasTable.turmaId, disciplinaId: turmaDisciplinasTable.disciplinaId, limite: turmaDisciplinasTable.maxAulasConsecutivasDia })
        .from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds))
    : [];
  const usadas = new Set(vinculos.map((v) => v.disciplinaId));
  const nomeDisc = new Map(disciplinas.map((d) => [d.id, d.nome]));
  const turmaPorId = new Map(turmas.map((t) => [t.id, t]));
  const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });
  res.json({
    padrao: REGRAS_REDE.maxAulasGeminadasPadrao,
    minimo: LIMITE_MIN,
    maximo: LIMITE_MAX,
    porDisciplina: Object.fromEntries(limites),
    // so as disciplinas que tem aula em alguma turma (o catalogo inteiro poluiria a lista)
    disciplinas: disciplinas.filter((d) => usadas.has(d.id)).sort((a, b) => porNome(a.nome, b.nome)),
    excecoes: vinculos
      .filter((v) => v.limite != null)
      .map((v) => ({
        turmaId: v.turmaId, turma: turmaPorId.get(v.turmaId)?.nome ?? `Turma #${v.turmaId}`, turno: turmaPorId.get(v.turmaId)?.turno ?? "",
        disciplinaId: v.disciplinaId, disciplina: nomeDisc.get(v.disciplinaId) ?? `Disciplina #${v.disciplinaId}`, limite: v.limite,
      }))
      .sort((a, b) => porNome(a.turma, b.turma) || porNome(a.disciplina, b.disciplina)),
  });
});

const PorDisciplinaBody = z.object({
  limites: z.record(z.string().regex(/^\d+$/), z.number().int().min(LIMITE_MIN).max(LIMITE_MAX).nullable()),
});

router.put("/por-disciplina", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = PorDisciplinaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Cada limite deve ser um número de ${LIMITE_MIN} a ${LIMITE_MAX} (ou vazio para usar o padrão).` });
    return;
  }
  // so disciplinas desta escola
  const ids = Object.keys(parsed.data.limites).map(Number);
  const daEscola = ids.length
    ? new Set((await db.select({ id: disciplinasTable.id }).from(disciplinasTable)
        .where(and(eq(disciplinasTable.escolaId, escolaId), inArray(disciplinasTable.id, ids)))).map((d) => d.id))
    : new Set<number>();
  const anteriores = await carregarLimitesPorDisciplina(escolaId);
  const novos = new Map(anteriores);
  for (const [k, v] of Object.entries(parsed.data.limites)) {
    const id = Number(k);
    if (!daEscola.has(id)) continue;
    if (v == null) novos.delete(id); else novos.set(id, v);
  }
  const valor = Object.fromEntries([...novos].sort((a, b) => a[0] - b[0]).map(([id, n]) => [String(id), n]));
  const [existente] = await db.select({ id: configuracoesTable.id }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_LIMITE_DISCIPLINA)));
  if (existente) {
    await db.update(configuracoesTable).set({ valor }).where(eq(configuracoesTable.id, existente.id));
  } else {
    await db.insert(configuracoesTable).values({ escolaId, chave: CHAVE_LIMITE_DISCIPLINA, valor, descricao: "Máximo de aulas por dia de cada disciplina (escola toda)" });
  }
  await registrarAuditoria({
    req, escolaId, entidade: "regras_distribuicao", entidadeId: 0, acao: "alteracao",
    dadosAnteriores: Object.fromEntries(anteriores), dadosNovos: valor,
  }).catch(() => undefined);
  res.json({ porDisciplina: valor });
});

router.delete("/excecao/:turmaId/:disciplinaId", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = Number(req.params.turmaId);
  const disciplinaId = Number(req.params.disciplinaId);
  if (!Number.isInteger(turmaId) || !Number.isInteger(disciplinaId)) {
    res.status(400).json({ error: "Turma ou disciplina inválida." });
    return;
  }
  const [turma] = await db.select({ id: turmasTable.id }).from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)));
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada." });
    return;
  }
  const [anterior] = await db.update(turmaDisciplinasTable).set({ maxAulasConsecutivasDia: null })
    .where(and(eq(turmaDisciplinasTable.turmaId, turmaId), eq(turmaDisciplinasTable.disciplinaId, disciplinaId)))
    .returning({ id: turmaDisciplinasTable.id });
  if (!anterior) {
    res.status(404).json({ error: "Esta disciplina não está vinculada à turma." });
    return;
  }
  await registrarAuditoria({
    req, escolaId, entidade: "regras_distribuicao", entidadeId: turmaId, acao: "alteracao",
    dadosAnteriores: { turmaId, disciplinaId }, dadosNovos: { turmaId, disciplinaId, maxAulasConsecutivasDia: null },
  }).catch(() => undefined);
  res.json({ ok: true });
});

export default router;
