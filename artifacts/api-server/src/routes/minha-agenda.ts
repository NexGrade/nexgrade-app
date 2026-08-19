import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  usuariosTable,
  professoresTable,
  horariosTable,
  disciplinasTable,
  turmasTable,
  reservasTable,
  salasTable,
} from "@workspace/db";
import { and, eq, gte, ne, or, isNull } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { z } from "zod";
import { validateReserva, publicReserva } from "./reservas";
import { regrasReservaProfessorTable } from "@workspace/db";

const router = Router();

// [PORTAL DO PROFESSOR] Todas as rotas aqui resolvem o professor a
// partir do e-mail da SESSAO LOGADA (Clerk) -- nunca aceitam um
// professorId vindo do cliente. Isso impede que um professor veja a
// agenda de outro, mesmo manipulando a URL/requisicao diretamente.
async function resolverProfessorLogado(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const escolaId = getEscolaId(req);

  const usuario = await db
    .select()
    .from(usuariosTable)
    .where(and(eq(usuariosTable.clerkId, userId), eq(usuariosTable.escolaId, escolaId)))
    .then((r) => r[0] ?? null);
  if (!usuario || usuario.perfil !== "professor" || !usuario.ativo) return null;

  const professor = await db
    .select()
    .from(professoresTable)
    .where(and(eq(professoresTable.email, usuario.email), eq(professoresTable.escolaId, escolaId)))
    .then((r) => r[0] ?? null);
  return professor;
}

router.get("/professor", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  res.json(professor);
});

router.get("/horario", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const escolaId = getEscolaId(req);
  const linhas = await db
    .select({
      diaSemana: horariosTable.diaSemana,
      numeroAula: horariosTable.numeroAula,
      sala: horariosTable.sala,
      disciplinaNome: disciplinasTable.nome,
      turmaNome: turmasTable.nome,
    })
    .from(horariosTable)
    .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(
      and(
        eq(horariosTable.professorId, professor.id),
        eq(horariosTable.escolaId, escolaId),
        or(eq(horariosTable.versaoGrade, "oficial"), isNull(horariosTable.versaoGrade)),
      ),
    )
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);
  res.json(linhas);
});

router.get("/reservas", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const escolaId = getEscolaId(req);
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = await db
    .select({
      id: reservasTable.id,
      data: reservasTable.data,
      diaSemana: reservasTable.diaSemana,
      numeroAula: reservasTable.numeroAula,
      titulo: reservasTable.titulo,
      observacoes: reservasTable.observacoes,
      status: reservasTable.status,
      salaNome: salasTable.nome,
    })
    .from(reservasTable)
    .innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
    .where(
      and(
        eq(reservasTable.professorId, professor.id),
        eq(reservasTable.escolaId, escolaId),
        ne(reservasTable.status, "cancelada"),
        gte(reservasTable.data, hoje),
      ),
    )
    .orderBy(reservasTable.data, reservasTable.numeroAula);
  res.json(linhas);
});

const CreateMinhaReservaBody = z.object({
  salaId: z.number().int(),
  data: z.string(),
  diaSemana: z.number().int().min(0).max(4),
  numeroAula: z.number().int().min(1),
  titulo: z.string().min(1),
  observacoes: z.string().optional(),
});

// [PORTAL DO PROFESSOR] Professor cria a PROPRIA reserva -- nunca
// recebe professorId do cliente, sempre usa o professor resolvido da
// sessao logada. Reaproveita a mesma validacao (conflito de sala,
// conflito de professor, prioridade, limite semanal) ja usada na
// rota administrativa POST /reservas.
//
// [REGRA] Diferente da coordenacao (que confirma direto), reserva
// criada pelo proprio professor so nasce "confirmada" se a prioridade
// dele (definida pela coordenacao em "Regras por professor") for 4 ou
// 5 -- prioridade 1 a 3 sempre entra como "pendente", aguardando
// aprovacao manual, mesmo sem nenhum conflito.
router.post("/reservas", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const parsed = CreateMinhaReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const escolaId = getEscolaId(req);
  const data = {
    salaId: parsed.data.salaId,
    professorId: professor.id,
    data: parsed.data.data,
    diaSemana: parsed.data.diaSemana,
    numeroAula: parsed.data.numeroAula,
  };
  const validation = await validateReserva(escolaId, data);
  if ("error" in validation) {
    res.status(validation.status).json(validation);
    return;
  }

  const rule = await db
    .select()
    .from(regrasReservaProfessorTable)
    .where(
      and(
        eq(regrasReservaProfessorTable.professorId, professor.id),
        eq(regrasReservaProfessorTable.escolaId, escolaId),
      ),
    )
    .then((r) => r[0] ?? null);
  const prioridadeProfessor = rule?.prioridade ?? 3;
  const statusFinal = prioridadeProfessor >= 4 ? validation.statusInicial : "pendente";

  const created = await db.transaction(async (tx) => {
    if (validation.reservaParaDeslocar) {
      await tx
        .update(reservasTable)
        .set({ status: "pendente" })
        .where(eq(reservasTable.id, validation.reservaParaDeslocar.id));
    }
    const [row] = await tx
      .insert(reservasTable)
      .values({
        ...data,
        escolaId,
        horarioId: validation.horario.id,
        titulo: parsed.data.titulo,
        observacoes: parsed.data.observacoes,
        prioridadeAplicada: validation.prioridade,
        status: statusFinal,
      })
      .returning();
    return row;
  });
  const result = await publicReserva(created);
  res.status(201).json(result);
});

export default router;
