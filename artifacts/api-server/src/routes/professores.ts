import { Router } from "express";
import { db } from "@workspace/db";
import { professoresTable, professorDisciplinasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateProfessorBody,
  UpdateProfessorBody,
  GetProfessorParams,
  UpdateProfessorParams,
  DeleteProfessorParams,
  GetProfessorCargaParams,
} from "@workspace/api-zod";
import { horariosTable } from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";

const router = Router();

async function getProfessorWithDisciplinas(id: number, escolaId: string) {
  const professor = await db
    .select()
    .from(professoresTable)
    .where(and(eq(professoresTable.id, id), eq(professoresTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!professor) return null;
  const links = await db
    .select()
    .from(professorDisciplinasTable)
    .where(eq(professorDisciplinasTable.professorId, id));
  return { ...professor, disciplinaIds: links.map((l) => l.disciplinaId) };
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professores = await db
    .select()
    .from(professoresTable)
    .where(eq(professoresTable.escolaId, escolaId))
    .orderBy(professoresTable.nome);
  const result = await Promise.all(
    professores.map(async (p) => {
      const links = await db
        .select()
        .from(professorDisciplinasTable)
        .where(eq(professorDisciplinasTable.professorId, p.id));
      return { ...p, disciplinaIds: links.map((l) => l.disciplinaId) };
    })
  );
  res.json(result);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CreateProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { disciplinaIds, ...data } = parsed.data as {
    nome: string; email: string; telefone?: string;
    cpf?: string; matricula?: string; cargaHorariaTotal?: number;
    disciplinaIds?: number[];
  };
  const [professor] = await db
    .insert(professoresTable)
    .values({ escolaId, nome: data.nome, email: data.email, telefone: data.telefone, cpf: data.cpf, matricula: data.matricula, cargaHorariaTotal: data.cargaHorariaTotal })
    .returning();
  if (disciplinaIds && disciplinaIds.length > 0) {
    await db.insert(professorDisciplinasTable).values(
      disciplinaIds.map((did) => ({ professorId: professor.id, disciplinaId: did }))
    );
  }
  const result = await getProfessorWithDisciplinas(professor.id, escolaId);
  await registrarAuditoria({
    req, escolaId, entidade: "professores", entidadeId: professor.id,
    acao: "criacao", dadosAnteriores: null, dadosNovos: result,
  });
  res.status(201).json(result);
});

router.get("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GetProfessorParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await getProfessorWithDisciplinas(parsed.data.id, escolaId);
  if (!result) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }
  res.json(result);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const paramsParsed = UpdateProfessorParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = UpdateProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { disciplinaIds, ...data } = parsed.data as {
    nome?: string; email?: string; telefone?: string; ativo?: boolean; disciplinaIds?: number[];
  };
  const id = paramsParsed.data.id;
  const anterior = await getProfessorWithDisciplinas(id, escolaId);
  if (!anterior) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }
  await db
    .update(professoresTable)
    .set(data)
    .where(and(eq(professoresTable.id, id), eq(professoresTable.escolaId, escolaId)));
  if (disciplinaIds !== undefined) {
    await db.delete(professorDisciplinasTable).where(eq(professorDisciplinasTable.professorId, id));
    if (disciplinaIds.length > 0) {
      await db.insert(professorDisciplinasTable).values(
        disciplinaIds.map((did) => ({ professorId: id, disciplinaId: did }))
      );
    }
  }
  const result = await getProfessorWithDisciplinas(id, escolaId);
  if (!result) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }
  await registrarAuditoria({
    req, escolaId, entidade: "professores", entidadeId: id,
    acao: "alteracao", dadosAnteriores: anterior, dadosNovos: result,
  });
  res.json(result);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DeleteProfessorParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const anterior = await getProfessorWithDisciplinas(parsed.data.id, escolaId);
  if (!anterior) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }
  await db
    .delete(professoresTable)
    .where(and(eq(professoresTable.id, parsed.data.id), eq(professoresTable.escolaId, escolaId)));
  await registrarAuditoria({
    req, escolaId, entidade: "professores", entidadeId: parsed.data.id,
    acao: "exclusao", dadosAnteriores: anterior, dadosNovos: null,
  });
  res.status(204).send();
});

router.get("/:id/carga", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GetProfessorCargaParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, parsed.data.id), eq(professoresTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }
  const slots = await db
    .select()
    .from(horariosTable)
    .where(and(eq(horariosTable.professorId, parsed.data.id), eq(horariosTable.escolaId, escolaId)));
  const diasNome = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const porDia: Record<string, number> = {};
  diasNome.forEach((d) => (porDia[d] = 0));
  slots.forEach((s) => {
    const nome = diasNome[s.diaSemana] ?? String(s.diaSemana);
    porDia[nome] = (porDia[nome] ?? 0) + 1;
  });
  res.json({ professorId: parsed.data.id, totalAulas: slots.length, porDia });
});

export default router;
