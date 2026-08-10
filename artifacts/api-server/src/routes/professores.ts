import { Router } from "express";
import { db } from "@workspace/db";
import { professoresTable, professorDisciplinasTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  CreateProfessorBody,
  UpdateProfessorBody,
  GetProfessorParams,
  UpdateProfessorParams,
  DeleteProfessorParams,
  GetProfessorCargaParams,
} from "@workspace/api-zod";
import { horariosTable, turmasTable, disponibilidadeTable } from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";
import { calcularHoraAtividadePorTurno } from "../lib/hora-atividade";

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

  // [FIX] N+1 -- antes fazia uma consulta separada pra buscar as
  // disciplinas de CADA professor (84 professores = 84 consultas extras
  // toda vez que essa lista carregava, e ela é usada em praticamente
  // toda tela do sistema via useListProfessores). Agora busca os
  // vínculos de TODOS de uma vez só e agrupa em memória.
  const ids = professores.map((p) => p.id);
  const links = ids.length
    ? await db.select().from(professorDisciplinasTable).where(inArray(professorDisciplinasTable.professorId, ids))
    : [];
  const disciplinaIdsPorProfessor = new Map<number, number[]>();
  links.forEach((l) => {
    if (!disciplinaIdsPorProfessor.has(l.professorId)) disciplinaIdsPorProfessor.set(l.professorId, []);
    disciplinaIdsPorProfessor.get(l.professorId)!.push(l.disciplinaId);
  });
  const result = professores.map((p) => ({ ...p, disciplinaIds: disciplinaIdsPorProfessor.get(p.id) ?? [] }));
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

// [FEATURE] Mesma logica de routes/export.ts -- resumo compacto dos
// horarios bloqueados de um professor num turno, agrupado por dia.
const DIAS_ABREV_CARGA = ["Seg", "Ter", "Qua", "Qui", "Sex"];
function resumoBloqueiosProfessor(bloqueios: Array<{ dia: number; aula: number }>): string {
  if (bloqueios.length === 0) return "Sem restricoes registradas";
  const porDia = new Map<number, number[]>();
  for (const b of bloqueios) {
    if (!porDia.has(b.dia)) porDia.set(b.dia, []);
    porDia.get(b.dia)!.push(b.aula);
  }
  const partes = [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dia, aulas]) => `${DIAS_ABREV_CARGA[dia] ?? dia}a (${aulas.sort((x, y) => x - y).join(",")}a)`);
  return `Bloqueado: ${partes.join(" - ")}`;
}
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

  // [NOVO] join com turmas pra saber o turno de cada aula — necessário
  // pro cálculo de HA institucional por turno (RNF-SEED-01, ver
  // lib/hora-atividade.ts) e pra regra de "HA no mesmo turno das aulas"
  // (Resolução SEED 7.200/2025, Art. 11, §4º).
  const slots = await db
    .select({ diaSemana: horariosTable.diaSemana, turno: turmasTable.turno })
    .from(horariosTable)
    .innerJoin(turmasTable, eq(horariosTable.turmaId, turmasTable.id))
    .where(and(eq(horariosTable.professorId, parsed.data.id), eq(horariosTable.escolaId, escolaId)));

  const diasNome = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const porDia: Record<string, number> = {};
  diasNome.forEach((d) => (porDia[d] = 0));
  const porTurno: Record<string, number> = {};
  slots.forEach((s) => {
    const nomeDia = diasNome[s.diaSemana] ?? String(s.diaSemana);
    porDia[nomeDia] = (porDia[nomeDia] ?? 0) + 1;
    porTurno[s.turno] = (porTurno[s.turno] ?? 0) + 1;
  });

  // [NOVO] RNF-SEED-01: HA institucional necessária, por turno.
  const haInstitucionalPorTurno = calcularHoraAtividadePorTurno(porTurno);
  const haInstitucionalTotal = Object.values(haInstitucionalPorTurno).reduce((a, b) => a + b, 0);

  // [NOVO] Quantas HA obrigatórias já estão de fato marcadas em
  // disponibilidade_professores, por turno — pra comparar com o
  // necessário acima e mostrar o que ainda falta alocar na grade.
  const haJaAlocadas = await db
    .select()
    .from(disponibilidadeTable)
    .where(and(eq(disponibilidadeTable.professorId, parsed.data.id), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)));
  const haAlocadaPorTurno: Record<string, number> = {};
  haJaAlocadas.forEach((d) => {
    const turno = d.turno ?? "indefinido";
    haAlocadaPorTurno[turno] = (haAlocadaPorTurno[turno] ?? 0) + 1;
  });

  // [FEATURE] Disponibilidade geral (nao so HA) por turno, resumida --
  // pedido pra mostrar carga horaria e disponibilidade juntas na tela
  // de edicao do professor, mesmo padrao usado no relatorio de PDF em
  // routes/export.ts.
  const bloqueiosGerais = await db
    .select()
    .from(disponibilidadeTable)
    .where(and(eq(disponibilidadeTable.professorId, parsed.data.id), eq(disponibilidadeTable.disponivel, false)));
  const bloqueiosPorTurnoMapa = new Map<string, Array<{ dia: number; aula: number }>>();
  bloqueiosGerais.forEach((d) => {
    const turno = d.turno ?? "indefinido";
    if (!bloqueiosPorTurnoMapa.has(turno)) bloqueiosPorTurnoMapa.set(turno, []);
    bloqueiosPorTurnoMapa.get(turno)!.push({ dia: d.diaSemana, aula: d.horarioSlot });
  });
  const bloqueiosResumoPorTurno: Record<string, string> = {};
  for (const [turno, bloqueios] of bloqueiosPorTurnoMapa) {
    bloqueiosResumoPorTurno[turno] = resumoBloqueiosProfessor(bloqueios);
  }
  res.json({
    professorId: parsed.data.id,
    totalAulas: slots.length,
    porDia,
    bloqueiosResumoPorTurno,
    // Campos novos abaixo — mantidos junto do payload antigo (porDia,
    // totalAulas) pra não quebrar nenhum client já existente.
    porTurno,
    haInstitucionalPorTurno,
    haInstitucionalTotal,
    haAlocadaPorTurno,
  });
});

export default router;
