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

const router = Router();

const NIVEIS = ["fundamental", "medio", "tecnico", "normal_magisterio"] as const;
const CATEGORIAS = ["BNC", "PD", "FGB", "PFO", "IFA", "IF", "IFP", "APF"] as const;
const EIXOS_TECNOLOGICOS = [
  "ambiente_saude", "controle_processos_industriais", "desenvolvimento_educacional_social",
  "gestao_negocios", "informacao_comunicacao", "infraestrutura", "militar",
  "producao_alimenticia", "producao_cultural_design", "producao_industrial",
  "recursos_naturais", "seguranca", "turismo_hospitalidade_lazer",
] as const;
// [NOVO] Ver enums.ts / formaOfertaEnum
const FORMAS_OFERTA = ["integrada", "concomitante_intercomplementar"] as const;

const CursoInput = z.object({
  nome: z.string().min(1),
  codigoCurso: z.string().optional(),
  nivel: z.enum(NIVEIS).default("fundamental"),
  eixoTecnologico: z.enum(EIXOS_TECNOLOGICOS).optional(),
  formaOferta: z.enum(FORMAS_OFERTA).optional(),
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
  codigoMatrizSere: z.string().optional(),
  itens: z.array(ItemMatrizInput).default([]),
});

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

  const { matriz, itensInseridos } = await db.transaction(async (tx) => {
    const [matriz] = await tx
      .insert(matrizesCurricularesTable)
      .values({
        escolaId, cursoId, serieAno: parsed.data.serieAno,
        codigoMatrizSere: parsed.data.codigoMatrizSere,
        cargaHorariaSemanalTotal,
      })
      .returning();

    const itensInseridos = parsed.data.itens.length
      ? await tx
          .insert(itensMatrizTable)
          .values(parsed.data.itens.map((item) => ({ ...item, matrizCurricularId: matriz.id })))
          .returning()
      : [];

    return { matriz, itensInseridos };
  });

  await registrarAuditoria({
    req, escolaId, entidade: "matrizes_curriculares", entidadeId: matriz.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: { ...matriz, itens: itensInseridos },
  });
  res.status(201).json({ ...matriz, itens: itensInseridos });
});

router.patch("/:cursoId/matrizes/:matrizId", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursoId = Number(req.params.cursoId);
  const matrizId = Number(req.params.matrizId);

  const matrizSchema = z.object({ codigoMatrizSere: z.string().nullable() });
  const parsed = matrizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const anterior = await db.select().from(matrizesCurricularesTable)
    .where(and(
      eq(matrizesCurricularesTable.id, matrizId),
      eq(matrizesCurricularesTable.cursoId, cursoId),
      eq(matrizesCurricularesTable.escolaId, escolaId),
    ))
    .then((r) => r[0]);
  if (!anterior) {
    res.status(404).json({ error: "Matriz curricular não encontrada" });
    return;
  }

  const [matriz] = await db.update(matrizesCurricularesTable)
    .set({ codigoMatrizSere: parsed.data.codigoMatrizSere })
    .where(eq(matrizesCurricularesTable.id, matrizId))
    .returning();

  await registrarAuditoria({
    req, escolaId, entidade: "matrizes_curriculares", entidadeId: matrizId,
    acao: "alteracao", dadosAnteriores: anterior, dadosNovos: matriz,
  });
  res.json(matriz);
});

router.post("/:cursoId/matrizes/:matrizId/itens", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursoId = Number(req.params.cursoId);
  const matrizId = Number(req.params.matrizId);

  const matriz = await db.select().from(matrizesCurricularesTable)
    .where(and(
      eq(matrizesCurricularesTable.id, matrizId),
      eq(matrizesCurricularesTable.cursoId, cursoId),
      eq(matrizesCurricularesTable.escolaId, escolaId),
    ))
    .then((r) => r[0]);
  if (!matriz) {
    res.status(404).json({ error: "Matriz curricular não encontrada" });
    return;
  }

  const parsed = ItemMatrizInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const disciplina = await db.select().from(disciplinasTable)
    .where(and(eq(disciplinasTable.id, parsed.data.disciplinaId), eq(disciplinasTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!disciplina) {
    res.status(404).json({ error: "Disciplina não encontrada" });
    return;
  }

  const { item, matrizAtualizada } = await db.transaction(async (tx) => {
    const [item] = await tx.insert(itensMatrizTable)
      .values({ ...parsed.data, matrizCurricularId: matrizId })
      .returning();

    const todosItens = await tx.select().from(itensMatrizTable)
      .where(eq(itensMatrizTable.matrizCurricularId, matrizId));
    const novoTotal = todosItens.reduce((soma, i) => soma + i.cargaHorariaSemanal, 0);

    const [matrizAtualizada] = await tx.update(matrizesCurricularesTable)
      .set({ cargaHorariaSemanalTotal: novoTotal })
      .where(eq(matrizesCurricularesTable.id, matrizId))
      .returning();

    return { item, matrizAtualizada };
  });

  await registrarAuditoria({
    req, escolaId, entidade: "itens_matriz", entidadeId: item.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: item,
  });
  res.status(201).json({ ...item, disciplina, matrizCurricularAtualizada: matrizAtualizada });
});

router.delete("/:cursoId/matrizes/:matrizId/itens/:itemId", async (req, res) => {
  const escolaId = getEscolaId(req);
  const cursoId = Number(req.params.cursoId);
  const matrizId = Number(req.params.matrizId);
  const itemId = Number(req.params.itemId);

  const matriz = await db.select().from(matrizesCurricularesTable)
    .where(and(
      eq(matrizesCurricularesTable.id, matrizId),
      eq(matrizesCurricularesTable.cursoId, cursoId),
      eq(matrizesCurricularesTable.escolaId, escolaId),
    ))
    .then((r) => r[0]);
  if (!matriz) {
    res.status(204).send();
    return;
  }

  const item = await db.select().from(itensMatrizTable)
    .where(and(eq(itensMatrizTable.id, itemId), eq(itensMatrizTable.matrizCurricularId, matrizId)))
    .then((r) => r[0]);
  if (!item) {
    res.status(204).send();
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(itensMatrizTable).where(eq(itensMatrizTable.id, itemId));

    const restantes = await tx.select().from(itensMatrizTable)
      .where(eq(itensMatrizTable.matrizCurricularId, matrizId));
    const novoTotal = restantes.reduce((soma, i) => soma + i.cargaHorariaSemanal, 0);

    await tx.update(matrizesCurricularesTable)
      .set({ cargaHorariaSemanalTotal: novoTotal })
      .where(eq(matrizesCurricularesTable.id, matrizId));
  });

  await registrarAuditoria({
    req, escolaId, entidade: "itens_matriz", entidadeId: itemId,
    acao: "exclusao", dadosAnteriores: item, dadosNovos: null,
  });
  res.status(204).send();
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
