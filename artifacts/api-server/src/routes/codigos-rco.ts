/**
 * [CODIGOS-RCO-TELA] (14/10/2026) Tela "Codigos do RCO": a escola cadastra sozinha os
 * codigos que o arquivo do RCO exige, sem depender de script.
 *  - Turma: codigo_sere (parte FGB / formacao geral) e codigo_sere_if (parte IF, so no
 *    3o ano tecnico dividido em duas turmas no RCO).
 *  - Disciplina: codigo_externo_rco (tem prioridade sobre o SAE; ver lib/rco-codigos.ts).
 * Leitura so para a coordenacao (lib/permissao.ts); alteracao ja e so da coordenacao
 * pelo filtro geral. Toda alteracao vai para o Historico (auditoria).
 */
import { Router } from "express";
import { db, turmasTable, disciplinasTable, horariosTable, turmaDisciplinasTable, codigosRcoDisciplinaTable } from "@workspace/db";
import { and, eq, inArray, ne, sql, or, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";
import { resolverCoddiscComOrigem } from "../lib/rco-codigos";

const router = Router();

// Codigo vazio ("" ou null) apaga; numero inteiro positivo grava.
const codigoOpcional = z.union([z.null(), z.literal(""), z.coerce.number().int().positive().max(2_000_000_000)])
  .transform((v) => (v === "" || v === null ? null : v));

const TurmaCodigos = z.object({
  codigoSere: codigoOpcional.optional(),
  codigoSereIf: codigoOpcional.optional(),
}).refine((d) => d.codigoSere !== undefined || d.codigoSereIf !== undefined, { message: "Nada para alterar" });

const DisciplinaCodigo = z.object({
  codigoExternoRco: codigoOpcional.optional(),
  codigoSae: codigoOpcional.optional(),
}).refine((d) => d.codigoExternoRco !== undefined || d.codigoSae !== undefined, { message: "Nada para alterar" });

// Nome comparavel entre escolas: sem acento, minusculo, espacos simples.
const chaveNome = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Valor unico entre as outras escolas; se elas discordam, nao sugere (ex.: Rec. Aprend. LP muda por nivel). */
function unico<T>(valores: (T | null | undefined)[]): T | null {
  const v = [...new Set(valores.filter((x): x is T => x != null))];
  return v.length === 1 ? v[0] : null;
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);

  const turmas = await db.select({
    id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno, serie: turmasTable.serie,
    codigoSere: turmasTable.codigoSere, codigoSereIf: turmasTable.codigoSereIf,
  }).from(turmasTable)
    .where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.fantasma, false)))
    .orderBy(turmasTable.turno, turmasTable.nome);

  // aulas da grade oficial por turma e por disciplina (o arquivo do RCO so leva a oficial)
  const aulas = await db.select({
    turmaId: horariosTable.turmaId, disciplinaId: horariosTable.disciplinaId, n: sql<number>`count(*)::int`,
  }).from(horariosTable)
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(and(eq(turmasTable.escolaId, escolaId), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`))
    .groupBy(horariosTable.turmaId, horariosTable.disciplinaId);
  const aulasPorTurma = new Map<number, number>();
  const aulasPorDisc = new Map<number, number>();
  for (const a of aulas) {
    aulasPorTurma.set(a.turmaId, (aulasPorTurma.get(a.turmaId) ?? 0) + a.n);
    aulasPorDisc.set(a.disciplinaId, (aulasPorDisc.get(a.disciplinaId) ?? 0) + a.n);
  }

  // disciplinas em uso: com aula na grade oficial ou ligadas a alguma turma
  const idsTurmas = turmas.map((t) => t.id);
  const vinculos = idsTurmas.length
    ? await db.selectDistinct({ disciplinaId: turmaDisciplinasTable.disciplinaId }).from(turmaDisciplinasTable)
      .where(inArray(turmaDisciplinasTable.turmaId, idsTurmas))
    : [];
  const idsDisc = [...new Set([...aulasPorDisc.keys(), ...vinculos.map((v) => v.disciplinaId)])];
  const discs = idsDisc.length
    ? await db.select({
      id: disciplinasTable.id, nome: disciplinasTable.nome, codigoSae: disciplinasTable.codigoSae,
      codigoExternoRco: disciplinasTable.codigoExternoRco, externoPeloSae: codigosRcoDisciplinaTable.codigoExterno,
    }).from(disciplinasTable)
      .leftJoin(codigosRcoDisciplinaTable, sql`${codigosRcoDisciplinaTable.codigoSae}::text = ${disciplinasTable.codigoSae}`)
      .where(and(eq(disciplinasTable.escolaId, escolaId), inArray(disciplinasTable.id, idsDisc)))
      .orderBy(disciplinasTable.nome)
    : [];

  // [CODIGOS-SUGESTAO] codigos SEED sao os mesmos em toda escola: sugere o que outra escola ja
  // cadastrou para a disciplina de mesmo nome (sem dizer qual escola). So sugere; quem aplica e a escola.
  const outras = discs.some((d) => d.codigoSae == null || d.codigoExternoRco == null)
    ? await db.select({ nome: disciplinasTable.nome, codigoSae: disciplinasTable.codigoSae, codigoExternoRco: disciplinasTable.codigoExternoRco })
      .from(disciplinasTable)
      .where(and(ne(disciplinasTable.escolaId, escolaId), or(isNotNull(disciplinasTable.codigoSae), isNotNull(disciplinasTable.codigoExternoRco))))
    : [];
  const porNome = new Map<string, { sae: (string | null)[]; ext: (number | null)[] }>();
  for (const o of outras) {
    const k = chaveNome(o.nome);
    const g = porNome.get(k) ?? { sae: [], ext: [] };
    g.sae.push(o.codigoSae); g.ext.push(o.codigoExternoRco);
    porNome.set(k, g);
  }

  // codigo SERE repetido em mais de uma turma (aviso, nao bloqueia)
  const usos = new Map<number, string[]>();
  for (const t of turmas) {
    for (const c of [t.codigoSere, t.codigoSereIf]) if (c != null) usos.set(c, [...(usos.get(c) ?? []), t.nome]);
  }

  const turmasOut = turmas.map((t) => {
    const repetidoCom = [t.codigoSere, t.codigoSereIf]
      .flatMap((c) => (c != null ? (usos.get(c) ?? []) : []))
      .filter((nome) => nome !== t.nome);
    return {
      ...t,
      aulas: aulasPorTurma.get(t.id) ?? 0,
      pendente: t.codigoSere == null && (aulasPorTurma.get(t.id) ?? 0) > 0,
      repetidoCom: [...new Set(repetidoCom)],
    };
  });
  const discsOut = discs.map((d) => {
    const r = resolverCoddiscComOrigem({ disciplinaNome: d.nome, codigoExternoRco: d.codigoExternoRco, externoPeloSae: d.externoPeloSae });
    const n = aulasPorDisc.get(d.id) ?? 0;
    const g = porNome.get(chaveNome(d.nome));
    const sugSae = d.codigoSae == null && g ? unico(g.sae) : null;
    const sugExt = d.codigoExternoRco == null && g ? unico(g.ext) : null;
    return {
      id: d.id, nome: d.nome, codigoSae: d.codigoSae, codigoExternoRco: d.codigoExternoRco,
      sugestao: sugSae != null || sugExt != null ? { codigoSae: sugSae, codigoExternoRco: sugExt } : null,
      codigoPeloSae: d.externoPeloSae ?? null,
      codigoNoRco: r?.codigo ?? null, origem: r?.origem ?? null,
      aulas: n, pendente: r == null && n > 0,
    };
  });

  res.json({
    turmas: turmasOut,
    disciplinas: discsOut,
    resumo: {
      turmasPendentes: turmasOut.filter((t) => t.pendente).length,
      disciplinasPendentes: discsOut.filter((d) => d.pendente).length,
      disciplinasComSugestao: discsOut.filter((d) => d.sugestao != null).length,
      turmasRepetidas: turmasOut.filter((t) => t.repetidoCom.length > 0).length,
    },
  });
});

router.patch("/turmas/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = TurmaCodigos.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Código inválido: use só números (ou deixe vazio para apagar)." }); return; }

  const [anterior] = await db.select({ id: turmasTable.id, nome: turmasTable.nome, codigoSere: turmasTable.codigoSere, codigoSereIf: turmasTable.codigoSereIf })
    .from(turmasTable).where(and(eq(turmasTable.id, id), eq(turmasTable.escolaId, escolaId)));
  if (!anterior) { res.status(404).json({ error: "Turma não encontrada" }); return; }

  const novo = {
    ...(parsed.data.codigoSere !== undefined ? { codigoSere: parsed.data.codigoSere } : {}),
    ...(parsed.data.codigoSereIf !== undefined ? { codigoSereIf: parsed.data.codigoSereIf } : {}),
  };
  const final = { codigoSere: anterior.codigoSere, codigoSereIf: anterior.codigoSereIf, ...novo };
  if (final.codigoSere != null && final.codigoSere === final.codigoSereIf) {
    res.status(400).json({ error: "O código da parte IF precisa ser diferente do código da turma." });
    return;
  }
  if (final.codigoSereIf != null && final.codigoSere == null) {
    res.status(400).json({ error: "Preencha primeiro o código da turma (formação geral); o da parte IF é o segundo código." });
    return;
  }

  const [turma] = await db.update(turmasTable).set(novo as any)
    .where(and(eq(turmasTable.id, id), eq(turmasTable.escolaId, escolaId)))
    .returning({ id: turmasTable.id, codigoSere: turmasTable.codigoSere, codigoSereIf: turmasTable.codigoSereIf });
  await registrarAuditoria({
    req, escolaId, entidade: "turmas", entidadeId: id, acao: "alteracao",
    dadosAnteriores: { nome: anterior.nome, codigoSere: anterior.codigoSere, codigoSereIf: anterior.codigoSereIf },
    dadosNovos: { nome: anterior.nome, ...turma },
  });
  res.json(turma);
});

router.patch("/disciplinas/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = DisciplinaCodigo.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Código inválido: use só números (ou deixe vazio para apagar)." }); return; }

  const [anterior] = await db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome, codigoSae: disciplinasTable.codigoSae, codigoExternoRco: disciplinasTable.codigoExternoRco })
    .from(disciplinasTable).where(and(eq(disciplinasTable.id, id), eq(disciplinasTable.escolaId, escolaId)));
  if (!anterior) { res.status(404).json({ error: "Disciplina não encontrada" }); return; }

  const novo = {
    ...(parsed.data.codigoExternoRco !== undefined ? { codigoExternoRco: parsed.data.codigoExternoRco } : {}),
    // codigo_sae e texto no banco
    ...(parsed.data.codigoSae !== undefined ? { codigoSae: parsed.data.codigoSae == null ? null : String(parsed.data.codigoSae) } : {}),
  };
  const [disc] = await db.update(disciplinasTable).set(novo as any)
    .where(and(eq(disciplinasTable.id, id), eq(disciplinasTable.escolaId, escolaId)))
    .returning({ id: disciplinasTable.id, codigoSae: disciplinasTable.codigoSae, codigoExternoRco: disciplinasTable.codigoExternoRco });
  await registrarAuditoria({
    req, escolaId, entidade: "disciplinas", entidadeId: id, acao: "alteracao",
    dadosAnteriores: { nome: anterior.nome, codigoSae: anterior.codigoSae, codigoExternoRco: anterior.codigoExternoRco },
    dadosNovos: { nome: anterior.nome, ...disc },
  });
  res.json(disc);
});

export default router;
