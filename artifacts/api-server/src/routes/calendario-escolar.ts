import { Router } from "express";
import { db } from "@workspace/db";
import { calendarioEscolarTable, trimestresLetivosTable, turmasTable, turmaDisciplinasTable, disciplinasTable, horariosTable, matrizesCurricularesTable, itensMatrizTable } from "@workspace/db";
import { and, eq, asc } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { z } from "zod";
import { CALENDARIOS_OFICIAIS, TIPOS_EVENTO, aplicarCalendarioOficial, validarTrimestres } from "../lib/calendario-oficial"; // [CALENDARIO-EDITAVEL]
import { registrarAuditoria } from "../lib/audit";

const router = Router();

// GET /calendario-escolar?ano=2026 -- lista eventos do calendario (feriados, recessos, marcos)
router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const eventos = await db.select().from(calendarioEscolarTable)
    .where(and(eq(calendarioEscolarTable.escolaId, escolaId), eq(calendarioEscolarTable.ano, ano)))
    .orderBy(asc(calendarioEscolarTable.data));

  res.json(eventos);
});

// GET /calendario-escolar/trimestres?ano=2026 -- resumo dos trimestres letivos
router.get("/trimestres", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const trimestres = await db.select().from(trimestresLetivosTable)
    .where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano)))
    .orderBy(asc(trimestresLetivosTable.trimestre));

  res.json(trimestres);
});

// GET /calendario-escolar/carga-horaria?ano=2026 -- carga horaria cumprida (grade x semanas letivas) vs exigida (matriz/override) por turma+disciplina
router.get("/carga-horaria", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();

  const [turmas, turmaDiscsTodos, disciplinas, horarios, trimestres, matrizes, itensMatrizTodos] = await Promise.all([
    db.select().from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.anoLetivo, ano))),
    db.select().from(turmaDisciplinasTable),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(trimestresLetivosTable).where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano))),
    db.select().from(matrizesCurricularesTable).where(eq(matrizesCurricularesTable.escolaId, escolaId)),
    db.select().from(itensMatrizTable),
  ]);

  const turmaIds = new Set(turmas.map(t => t.id));
  const turmaDiscs = turmaDiscsTodos.filter(td => turmaIds.has(td.turmaId));

  const resultado = turmaDiscs.map(td => {
    const turma = turmas.find(t => t.id === td.turmaId);
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!turma || !disc) return null;

    let cargaSemanalExigida = td.cargaHorariaSemanalOverride;
    if (cargaSemanalExigida == null && turma.matrizCurricularId) {
      const matriz = matrizes.find(m => m.id === turma.matrizCurricularId);
      if (matriz) {
        const item = itensMatrizTodos.find(im => im.matrizCurricularId === matriz.id && im.disciplinaId === disc.id);
        if (item) cargaSemanalExigida = item.cargaHorariaSemanal;
      }
    }
    if (cargaSemanalExigida == null) cargaSemanalExigida = disc.cargaSemanal;

    const aulasSemanaGrid = horarios.filter(h => h.turmaId === turma.id && h.disciplinaId === disc.id).length;

    const trimestresCalc = trimestres.map(t => {
      const semanasLetivas = t.diasLetivos / 5;
      const cumprido = Math.round(aulasSemanaGrid * semanasLetivas);
      const exigido = Math.round((cargaSemanalExigida as number) * semanasLetivas);
      return {
        trimestre: t.trimestre,
        semanasLetivas: Math.round(semanasLetivas * 10) / 10,
        cumprido,
        exigido,
        status: cumprido >= exigido ? "ok" : "insuficiente",
      };
    });

    const totalCumprido = trimestresCalc.reduce((s, t) => s + t.cumprido, 0);
    const totalExigido = trimestresCalc.reduce((s, t) => s + t.exigido, 0);

    return {
      turmaId: turma.id,
      turmaNome: turma.nome,
      disciplinaId: disc.id,
      disciplinaNome: disc.nome,
      cargaSemanalExigida,
      aulasSemanaGrid,
      trimestres: trimestresCalc,
      totalCumprido,
      totalExigido,
      status: totalCumprido >= totalExigido ? "ok" : "insuficiente",
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  res.json(resultado);
});

// ---------------------------------------------------------------------------
// [CALENDARIO-EDITAVEL] (15/10/2026) a escola cadastra e ajusta o proprio calendario.
// Alteracoes so para direcao/coordenacao/secretaria (filtro unico em lib/permissao.ts).
// ---------------------------------------------------------------------------
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");
const eventoInput = z.object({
  data: dataISO,
  tipo: z.enum(TIPOS_EVENTO),
  descricao: z.string().trim().min(1, "informe a descrição").max(200),
  diaLetivo: z.boolean().optional(),
});
const trimestresInput = z.object({
  ano: z.number().int().min(2020).max(2100),
  trimestres: z.array(z.object({
    trimestre: z.number().int().min(1).max(4),
    dataInicio: dataISO,
    dataFim: dataISO,
    diasLetivos: z.number().int(),
  })).min(1).max(4),
});
const erroZod = (e: z.ZodError) => e.issues.map((i) => i.message).join("; ");

// GET /calendario-escolar/oficial -- anos com calendario oficial disponivel
router.get("/oficial", (_req, res) => {
  res.json(Object.values(CALENDARIOS_OFICIAIS).map((c) => ({
    ano: c.ano, fonte: c.fonte, trimestres: c.trimestres,
    diasLetivos: c.trimestres.reduce((s, t) => s + t.diasLetivos, 0), eventos: c.eventos.length,
  })));
});

// POST /calendario-escolar/aplicar-oficial { ano } -- troca o calendario do ano pelo oficial
router.post("/aplicar-oficial", async (req, res) => {
  const escolaId = getEscolaId(req);
  const ano = Number(req.body?.ano);
  if (!CALENDARIOS_OFICIAIS[ano]) { res.status(400).json({ error: `Não há calendário oficial para ${req.body?.ano}.` }); return; }
  const r = await aplicarCalendarioOficial(escolaId, ano);
  await registrarAuditoria({ req, escolaId, entidade: "calendario_escolar", entidadeId: ano, acao: "alteracao", dadosAnteriores: null, dadosNovos: { aplicouOficial: r.fonte, ano } }).catch(() => undefined);
  res.json({ ok: true, mensagem: `Calendário oficial ${ano} aplicado: ${r.trimestres} trimestres e ${r.eventos} datas (${r.fonte}).` });
});

// PUT /calendario-escolar/trimestres { ano, trimestres[] } -- grava os trimestres do ano
router.put("/trimestres", async (req, res) => {
  const escolaId = getEscolaId(req);
  const p = trimestresInput.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: erroZod(p.error) }); return; }
  const { ano, trimestres } = p.data;
  const erro = validarTrimestres(ano, trimestres);
  if (erro) { res.status(400).json({ error: erro }); return; }
  const antes = await db.select().from(trimestresLetivosTable).where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano)));
  await db.transaction(async (tx) => {
    await tx.delete(trimestresLetivosTable).where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, ano)));
    await tx.insert(trimestresLetivosTable).values(trimestres.map((t) => ({ escolaId, ano, ...t })));
  });
  await registrarAuditoria({ req, escolaId, entidade: "trimestres_letivos", entidadeId: ano, acao: "alteracao", dadosAnteriores: antes, dadosNovos: trimestres }).catch(() => undefined);
  res.json({ ok: true, mensagem: `Trimestres de ${ano} gravados.` });
});

// POST /calendario-escolar -- novo evento (feriado, recesso, reposicao...)
router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const p = eventoInput.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: erroZod(p.error) }); return; }
  const ano = Number(p.data.data.slice(0, 4));
  const [criado] = await db.insert(calendarioEscolarTable).values({ escolaId, ano, ...p.data, diaLetivo: p.data.diaLetivo ?? p.data.tipo === "reposicao" }).returning();
  await registrarAuditoria({ req, escolaId, entidade: "calendario_escolar", entidadeId: criado.id, acao: "criacao", dadosAnteriores: null, dadosNovos: criado }).catch(() => undefined);
  res.status(201).json(criado);
});

// PUT /calendario-escolar/:id -- altera um evento
router.put("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const p = eventoInput.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: erroZod(p.error) }); return; }
  const filtro = and(eq(calendarioEscolarTable.id, id), eq(calendarioEscolarTable.escolaId, escolaId));
  const [antes] = await db.select().from(calendarioEscolarTable).where(filtro);
  if (!antes) { res.status(404).json({ error: "Evento não encontrado." }); return; }
  const [depois] = await db.update(calendarioEscolarTable)
    .set({ ...p.data, ano: Number(p.data.data.slice(0, 4)), diaLetivo: p.data.diaLetivo ?? p.data.tipo === "reposicao" })
    .where(filtro).returning();
  await registrarAuditoria({ req, escolaId, entidade: "calendario_escolar", entidadeId: id, acao: "alteracao", dadosAnteriores: antes, dadosNovos: depois }).catch(() => undefined);
  res.json(depois);
});

// DELETE /calendario-escolar/:id
router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [apagado] = await db.delete(calendarioEscolarTable)
    .where(and(eq(calendarioEscolarTable.id, id), eq(calendarioEscolarTable.escolaId, escolaId))).returning();
  if (!apagado) { res.status(404).json({ error: "Evento não encontrado." }); return; }
  await registrarAuditoria({ req, escolaId, entidade: "calendario_escolar", entidadeId: id, acao: "exclusao", dadosAnteriores: apagado, dadosNovos: null }).catch(() => undefined);
  res.json({ ok: true });
});

export default router;