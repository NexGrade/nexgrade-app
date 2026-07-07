import { Router } from "express";
import { db } from "@workspace/db";
import {
  cursosTable,
  matrizesCurricularesTable,
  itensMatrizTable,
  disciplinasTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";

// RF-CUR-01 a RF-CUR-05: Curso, Matriz Curricular e Itens da Matriz.
// Ver docs/requisitos-funcionais-e-nao-funcionais.md e
// docs/analise-formatos-uranin-sere.md.
//
// [ATUALIZADO] categoriaCurricular passou a usar as siglas oficiais de
// Composição Curricular da SEED-PR (BNC/PD/FGB/PFO/IFA/IFP/APF/IF), não
// mais a nomenclatura própria que este arquivo usava antes
// (base_nacional_comum, parte_diversificada, etc.). Isso está de acordo
// com a seção 0.2 de docs/analise-formatos-uranin-sere.md: códigos
// oficiais do governo (SAE, INEP, Composição Curricular) são dados
// públicos da SEED-PR, seguros para uso — o que a diretriz pede pra NÃO
// reaproveitar é a taxonomia proprietária do concorrente (ex.: os
// códigos de geminação "TIPO A"–"TIPO $"), não terminologia oficial do
// Estado. A coluna categoria_curricular no banco já foi migrada para
// este enum (ver lib/db, migration 0001).
//
// [NOTA] O valor "IF" (sem sufixo) foi incluído por segurança: a seção
// 2.2 do documento de análise identificou que cursos "ENSINO MEDIO IF..."
// usam a etiqueta "IF" sozinha para categorias equivalentes a IFA em
// outros cursos — ainda não confirmado oficialmente com a SEED-PR se são
// a mesma coisa ou categorias distintas. Ver também o item "CONFIRMAR"
// correspondente no plano de implementação.
const router = Router();

const NIVEIS = ["fundamental", "medio", "tecnico", "normal_magisterio"] as const;
const CATEGORIAS = [
  "BNC",
  "PD",
  "FGB",
  "PFO",
  "IFA",
  "IF",
  "IFP",
  "APF",
] as const;

const CursoInput = z.object({
  nome: z.string().min(1),
  codigoCurso: z.string().optional(),
  nivel: z.enum(NIVEIS).default("fundamental"),
});

const ItemMatrizInput = z.object({
  disciplinaId: z.number().int(),
  categoriaCurricular: z.enum(CATEGORIAS).default("BNC"),
  cargaHorariaSemanal: z.number().int().min(1),
  grupoDisciplina: z.string().optional(),
  ehPadraoDoGrupo: z.boolean().default(false),
  obrigatoria: z.boolean().default(true),
});

const MatrizInput = z.object({
  serieAno: z.string().min(1),
  itens: z.array(ItemMatrizInput).default([]),
});

// ── CURSOS ──────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursos = await db.select().from(cursosTable).where(eq(cursosTable.escolaId, escolaId));
  res.json(cursos);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CursoInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [curso] = await db.insert(cursosTable).values({ ...parsed.data, escolaId }).returning();
  await registrarAuditoria({
    req, escolaId, entidade: "cursos", entidadeId: curso.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: curso,
  });
  res.status(201).json(curso);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  const parsed = CursoInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const anterior = await db.select().from(cursosTable)
    .where(and(eq(cursosTable.id, id), eq(cursosTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!anterior) {
    res.status(404).json({ error: "Curso não encontrado" });
    return;
  }
  const [curso] = await db
    .update(cursosTable)
    .set(parsed.data)
    .where(and(eq(cursosTable.id, id), eq(cursosTable.escolaId, escolaId)))
    .returning();
  await registrarAuditoria({
    req, escolaId, entidade: "cursos", entidadeId: id,
    acao: "alteracao", dadosAnteriores: anterior, dadosNovos: curso,
  });
  res.json(curso);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  const anterior = await db.select().from(cursosTable)
    .where(and(eq(cursosTable.id, id), eq(cursosTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!anterior) {
    res.status(204).send();
    return;
  }
  await db.delete(cursosTable).where(and(eq(cursosTable.id, id), eq(cursosTable.escolaId, escolaId)));
  await registrarAuditoria({
    req, escolaId, entidade: "cursos", entidadeId: id,
    acao: "exclusao", dadosAnteriores: anterior, dadosNovos: null,
  });
  res.status(204).send();
});

// ── MATRIZES CURRICULARES (por curso) ────────────────────────────────────

router.get("/:cursoId/matrizes", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursoId = Number(req.params.cursoId);

  const curso = await db.select().from(cursosTable)
    .where(and(eq(cursosTable.id, cursoId), eq(cursosTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!curso) {
    res.status(404).json({ error: "Curso não encontrado" });
    return;
  }

  const matrizes = await db
    .select()
    .from(matrizesCurricularesTable)
    .where(and(eq(matrizesCurricularesTable.cursoId, cursoId), eq(matrizesCurricularesTable.escolaId, escolaId)));

  const comItens = await Promise.all(
    matrizes.map(async (matriz) => {
      const itens = await db
        .select()
        .from(itensMatrizTable)
        .where(eq(itensMatrizTable.matrizCurricularId, matriz.id));
      const itensComDisciplina = await Promise.all(
        itens.map(async (item) => {
          const disciplina = await db
            .select()
            .from(disciplinasTable)
            .where(eq(disciplinasTable.id, item.disciplinaId))
            .then((r) => r[0]);
          return { ...item, disciplina };
        }),
      );
      return { ...matriz, itens: itensComDisciplina };
    }),
  );

  res.json(comItens);
});

router.post("/:cursoId/matrizes", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursoId = Number(req.params.cursoId);

  const curso = await db.select().from(cursosTable)
    .where(and(eq(cursosTable.id, cursoId), eq(cursosTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!curso) {
    res.status(404).json({ error: "Curso não encontrado" });
    return;
  }

  const parsed = MatrizInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const cargaHorariaSemanalTotal = parsed.data.itens.reduce((soma, i) => soma + i.cargaHorariaSemanal, 0);

  const [matriz] = await db
    .insert(matrizesCurricularesTable)
    .values({ escolaId, cursoId, serieAno: parsed.data.serieAno, cargaHorariaSemanalTotal })
    .returning();

  const itensInseridos = parsed.data.itens.length
    ? await db
        .insert(itensMatrizTable)
        .values(parsed.data.itens.map((item) => ({ ...item, matrizCurricularId: matriz.id })))
        .returning()
    : [];

  await registrarAuditoria({
    req, escolaId, entidade: "matrizes_curriculares", entidadeId: matriz.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: { ...matriz, itens: itensInseridos },
  });
  res.status(201).json({ ...matriz, itens: itensInseridos });
});

router.delete("/:cursoId/matrizes/:matrizId", async (req, res) => {
  const escolaId = getEscolaId(req);
  const matrizId = Number(req.params.matrizId);

  const matriz = await db.select().from(matrizesCurricularesTable)
    .where(and(eq(matrizesCurricularesTable.id, matrizId), eq(matrizesCurricularesTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!matriz) {
    res.status(204).send();
    return;
  }

  await db.delete(matrizesCurricularesTable).where(eq(matrizesCurricularesTable.id, matrizId));
  await registrarAuditoria({
    req, escolaId, entidade: "matrizes_curriculares", entidadeId: matrizId,
    acao: "exclusao", dadosAnteriores: matriz, dadosNovos: null,
  });
  res.status(204).send();
});

export default router;