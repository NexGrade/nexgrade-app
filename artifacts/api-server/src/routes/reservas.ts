import { Router } from "express";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import {
  CreateReservaBody,
  CreateReservaResponse,
  DeleteReservaParams,
  GetReservasResumoQueryParams,
  GetReservasResumoResponse,
  ListRegrasReservaProfessoresResponse,
  ListReservasQueryParams,
  ListReservasResponse,
  UpdateRegraReservaProfessorBody,
  UpdateRegraReservaProfessorParams,
  UpdateRegraReservaProfessorResponse,
  UpdateReservaBody,
  UpdateReservaParams,
  UpdateReservaResponse,
} from "@workspace/api-zod";
import {
  comunicadosTable,
  db,
  horariosTable,
  professoresTable,
  regrasReservaProfessorTable,
  reservasTable,
  salasTable,
} from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";

const router = Router();
const diasSemana = [0, 1, 2, 3, 4] as const;
const salaTypeValues = [
  "sala_aula",
  "laboratorio",
  "quadra",
  "informatica",
  "auditorio",
  "biblioteca",
  "sala_arte",
  "outro",
] as const;

export type ReservaData = typeof reservasTable.$inferSelect;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateFromOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function weekBounds(data: string): { inicio: string; fim: string } {
  const date = dateFromOnly(data);
  const javascriptDay = date.getUTCDay();
  const mondayOffset = javascriptDay === 0 ? 6 : javascriptDay - 1;
  const inicio = new Date(date);
  inicio.setUTCDate(date.getUTCDate() - mondayOffset);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 4);
  return { inicio: dateOnly(inicio), fim: dateOnly(fim) };
}

function queryWithDates(query: Record<string, unknown>) {
  const normalized = { ...query };
  if (typeof normalized.data === "string") {
    normalized.data = dateFromOnly(normalized.data);
  }
  return normalized;
}

async function getReserva(id: number, escolaId: string): Promise<ReservaData | null> {
  const [reserva] = await db
    .select()
    .from(reservasTable)
    .where(and(eq(reservasTable.id, id), eq(reservasTable.escolaId, escolaId)));
  return reserva ?? null;
}

export async function publicReserva(reserva: ReservaData) {
  const [sala, professor] = await Promise.all([
    db
      .select()
      .from(salasTable)
      .where(and(eq(salasTable.id, reserva.salaId), eq(salasTable.escolaId, reserva.escolaId)))
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(professoresTable)
      .where(
        and(
          eq(professoresTable.id, reserva.professorId),
          eq(professoresTable.escolaId, reserva.escolaId),
        ),
      )
      .then((rows) => rows[0] ?? null),
  ]);

  return {
    ...reserva,
    sala: sala
      ? {
          id: sala.id,
          nome: sala.nome,
          tipo: salaTypeValues.includes(sala.tipo as (typeof salaTypeValues)[number])
            ? sala.tipo
            : "outro",
          capacidade: sala.capacidade,
          ativa: sala.ativa,
          observacoes: sala.observacoes,
        }
      : null,
    professor: professor
      ? {
          id: professor.id,
          nome: professor.nome,
          email: professor.email,
          telefone: professor.telefone,
          ativo: professor.ativo,
          disciplinaIds: [],
          createdAt: professor.createdAt.toISOString(),
        }
      : null,
  };
}

async function getProfessorRule(escolaId: string, professorId: number) {
  const [rule] = await db
    .select()
    .from(regrasReservaProfessorTable)
    .where(
      and(
        eq(regrasReservaProfessorTable.escolaId, escolaId),
        eq(regrasReservaProfessorTable.professorId, professorId),
      ),
    );
  return rule ?? null;
}

export type ValidationError = {
  status: number;
  error: string;
  conflito?: { tipo: string; reservaId?: number };
  prioridadeExistente?: number;
  limiteSemanal?: number;
  reservasNaSemana?: number;
};

export type ValidationSuccess = {
  sala: typeof salasTable.$inferSelect;
  professor: typeof professoresTable.$inferSelect;
  horario: typeof horariosTable.$inferSelect;
  rule: typeof regrasReservaProfessorTable.$inferSelect | null;
  prioridade: number;
  reservaParaDeslocar: ReservaData | null;
  statusInicial: "confirmada" | "pendente";
  limiteSemanal: number;
  reservasNaSemana: number;
};

export async function validateReserva(
  escolaId: string,
  input: {
    salaId: number;
    professorId: number;
    data: string;
    diaSemana: number;
    numeroAula: number;
  },
  excludeId?: number,
): Promise<ValidationError | ValidationSuccess> {
  if (!diasSemana.includes(input.diaSemana as (typeof diasSemana)[number])) {
    return { status: 400, error: "O dia precisa estar entre segunda e sexta-feira." };
  }

  const weekDay = dateFromOnly(input.data).getUTCDay();
  const normalizedWeekDay = weekDay === 0 ? 6 : weekDay - 1;
  if (normalizedWeekDay !== input.diaSemana) {
    return {
      status: 400,
      error: "A data informada não corresponde ao dia da semana selecionado.",
    };
  }

  const [sala, professor, horario, rule] = await Promise.all([
    db
      .select()
      .from(salasTable)
      .where(and(eq(salasTable.id, input.salaId), eq(salasTable.escolaId, escolaId)))
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(professoresTable)
      .where(
        and(
          eq(professoresTable.id, input.professorId),
          eq(professoresTable.escolaId, escolaId),
        ),
      )
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(horariosTable)
      .where(
        and(
          eq(horariosTable.escolaId, escolaId),
          eq(horariosTable.professorId, input.professorId),
          eq(horariosTable.diaSemana, input.diaSemana),
          eq(horariosTable.numeroAula, input.numeroAula),
          or(eq(horariosTable.versaoGrade, "oficial"), isNull(horariosTable.versaoGrade)),
        ),
      )
      .then((rows) => rows[0] ?? null),
    getProfessorRule(escolaId, input.professorId),
  ]);

  if (!sala) return { status: 404, error: "Sala não encontrada." };
  if (!sala.ativa) return { status: 409, error: "A sala selecionada está inativa." };
  if (!professor) return { status: 404, error: "Professor não encontrado." };
  if (!professor.ativo) return { status: 409, error: "O professor selecionado está inativo." };
  if (!horario) {
    return {
      status: 409,
      error: "Não há aula desse professor na grade oficial para o dia e período selecionados.",
    };
  }

  const reservationConditions: SQL[] = [
    eq(reservasTable.escolaId, escolaId),
    eq(reservasTable.data, input.data),
    eq(reservasTable.numeroAula, input.numeroAula),
    ne(reservasTable.status, "cancelada"),
  ];
  if (excludeId !== undefined) {
    reservationConditions.push(ne(reservasTable.id, excludeId));
  }

  const [roomConflict, professorConflict] = await Promise.all([
    db
      .select()
      .from(reservasTable)
      .where(
        and(
          ...reservationConditions,
          eq(reservasTable.salaId, input.salaId),
        ),
      )
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(reservasTable)
      .where(
        and(
          ...reservationConditions,
          eq(reservasTable.professorId, input.professorId),
        ),
      )
      .then((rows) => rows[0] ?? null),
  ]);

  // Conflito de PROFESSOR nunca e resolvivel por prioridade -- e
  // fisicamente impossivel a mesma pessoa estar em dois lugares ao
  // mesmo tempo, independente de quem pediu primeiro ou tem mais
  // prioridade. Bloqueia sempre.
  if (professorConflict) {
    return {
      status: 409,
      error: "Este professor já possui outra reserva no mesmo período.",
      conflito: { tipo: "professor", reservaId: professorConflict.id },
      prioridadeExistente: professorConflict.prioridadeAplicada,
    };
  }

  const prioridadeSolicitante = rule?.prioridade ?? 3;

  // [REGRA DE PRIORIDADE] Conflito de SALA: se a nova solicitacao tem
  // prioridade MAIOR que a reserva existente, a existente e deslocada
  // para "pendente" (nao cancelada -- fica visivel pra alguem revisar
  // e reagendar) e a nova reserva segue como "confirmada". Se a
  // prioridade for igual ou menor, mantem o bloqueio (409) -- nunca
  // desaloja silenciosamente quem tem prioridade igual ou maior.
  let reservaParaDeslocar: ReservaData | null = null;
  if (roomConflict) {
    if (prioridadeSolicitante > roomConflict.prioridadeAplicada) {
      reservaParaDeslocar = roomConflict;
    } else {
      return {
        status: 409,
        error: "Este espaço já está reservado para esse período.",
        conflito: { tipo: "sala", reservaId: roomConflict.id },
        prioridadeExistente: roomConflict.prioridadeAplicada,
      };
    }
  }

  const { inicio, fim } = weekBounds(input.data);
  const weeklyConditions: SQL[] = [
    eq(reservasTable.escolaId, escolaId),
    eq(reservasTable.professorId, input.professorId),
    gte(reservasTable.data, inicio),
    lte(reservasTable.data, fim),
    ne(reservasTable.status, "cancelada"),
  ];
  if (excludeId !== undefined) {
    weeklyConditions.push(ne(reservasTable.id, excludeId));
  }
  const weeklyReservations = await db
    .select({ id: reservasTable.id })
    .from(reservasTable)
    .where(and(...weeklyConditions));
  const limiteSemanal = rule?.limiteSemanal ?? 2;

  // [REGRA DE FILA] Estourar o limite semanal nao bloqueia mais a
  // reserva -- ela entra como "pendente" (fila de confirmacao, como
  // ja diz a mensagem de sucesso do frontend), aguardando alguem
  // confirmar manualmente ou ajustar o limite do professor.
  const excedeuLimite = weeklyReservations.length >= limiteSemanal;

  return {
    sala,
    professor,
    horario,
    rule,
    prioridade: prioridadeSolicitante,
    reservaParaDeslocar,
    statusInicial: excedeuLimite ? "pendente" : "confirmada",
    limiteSemanal,
    reservasNaSemana: weeklyReservations.length,
  };
}

router.get("/", async (req, res): Promise<void> => {
  const escolaId = getEscolaId(req);
  const parsed = ListReservasQueryParams.safeParse(queryWithDates(req.query));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions: SQL[] = [eq(reservasTable.escolaId, escolaId)];
  if (parsed.data.data) conditions.push(eq(reservasTable.data, dateOnly(parsed.data.data)));
  if (parsed.data.salaId !== undefined) conditions.push(eq(reservasTable.salaId, parsed.data.salaId));
  if (parsed.data.professorId !== undefined) conditions.push(eq(reservasTable.professorId, parsed.data.professorId));
  if (parsed.data.status !== undefined) conditions.push(eq(reservasTable.status, parsed.data.status));

  const reservas = await db
    .select()
    .from(reservasTable)
    .where(and(...conditions))
    .orderBy(asc(reservasTable.data), asc(reservasTable.numeroAula), asc(reservasTable.prioridadeAplicada));
  const result = await Promise.all(reservas.map(publicReserva));
  res.json(ListReservasResponse.parse(result));
});

router.get("/resumo", async (req, res): Promise<void> => {
  const rawData = typeof req.query.data === "string" ? req.query.data : "";
  const parsed = GetReservasResumoQueryParams.safeParse({ data: dateFromOnly(rawData) });
  if (!parsed.success || !rawData) {
    res.status(400).json({ error: "Informe uma data válida para o resumo." });
    return;
  }
  const data = dateOnly(parsed.data.data);
  const reservas = await db
    .select()
    .from(reservasTable)
    .where(and(eq(reservasTable.escolaId, getEscolaId(req)), eq(reservasTable.data, data)));
  const ativas = reservas.filter((reserva) => reserva.status !== "cancelada");
  const porPrioridade = [1, 2, 3, 4, 5].map((prioridade) => ({
    prioridade,
    quantidade: ativas.filter((reserva) => reserva.prioridadeAplicada === prioridade).length,
  }));
  const result = {
    data: parsed.data.data,
    total: reservas.length,
    confirmadas: reservas.filter((reserva) => reserva.status === "confirmada").length,
    pendentes: reservas.filter((reserva) => reserva.status === "pendente").length,
    canceladas: reservas.filter((reserva) => reserva.status === "cancelada").length,
    salasOcupadas: new Set(ativas.map((reserva) => reserva.salaId)).size,
    porPrioridade,
  };
  res.json(GetReservasResumoResponse.parse(result));
});

router.get("/regras-professores", async (req, res): Promise<void> => {
  const escolaId = getEscolaId(req);
  const [professores, regras] = await Promise.all([
    db
      .select()
      .from(professoresTable)
      .where(eq(professoresTable.escolaId, escolaId))
      .orderBy(asc(professoresTable.nome)),
    db
      .select()
      .from(regrasReservaProfessorTable)
      .where(eq(regrasReservaProfessorTable.escolaId, escolaId)),
  ]);
  const { inicio, fim } = weekBounds(dateOnly(new Date()));
  const semana = await db
    .select()
    .from(reservasTable)
    .where(
      and(
        eq(reservasTable.escolaId, escolaId),
        gte(reservasTable.data, inicio),
        lte(reservasTable.data, fim),
        ne(reservasTable.status, "cancelada"),
      ),
    );
  const result = professores.map((professor) => {
    const regra = regras.find((item) => item.professorId === professor.id);
    return {
      professorId: professor.id,
      professorNome: professor.nome,
      limiteSemanal: regra?.limiteSemanal ?? 2,
      prioridade: regra?.prioridade ?? 3,
      reservasNaSemana: semana.filter((item) => item.professorId === professor.id).length,
      regraId: regra?.id ?? null,
    };
  });
  res.json(ListRegrasReservaProfessoresResponse.parse(result));
});

router.post("/", async (req, res): Promise<void> => {
  const escolaId = getEscolaId(req);
  const parsed = CreateReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = {
    salaId: parsed.data.salaId,
    professorId: parsed.data.professorId,
    data: dateOnly(parsed.data.data),
    diaSemana: parsed.data.diaSemana,
    numeroAula: parsed.data.numeroAula,
  };
  const validation = await validateReserva(escolaId, data);
  if ("error" in validation) {
    res.status(validation.status).json(validation);
    return;
  }
  const created = await db.transaction(async (tx) => {
    // Se uma reserva de prioridade menor foi deslocada, marca como
    // pendente ANTES de inserir a nova -- evita violar o indice unico
    // (sala+data+aula) que so permite UMA reserva ativa por slot.
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
        status: validation.statusInicial,
      })
      .returning();
    return row;
  });
  if (validation.reservaParaDeslocar) {
    await db.insert(comunicadosTable).values({
      escolaId,
      titulo: "Reserva movida para pendente",
      mensagem: `Sua reserva "${validation.reservaParaDeslocar.titulo}" foi movida para pendente por causa de outra reserva de prioridade maior no mesmo espaco.`,
      tipo: "reserva",
      professorId: validation.reservaParaDeslocar.professorId,
    });
  }
  const result = await publicReserva(created);
  res.status(201).json({
    ...CreateReservaResponse.parse(result),
    ...(validation.reservaParaDeslocar
      ? {
          reservaDeslocada: {
            id: validation.reservaParaDeslocar.id,
            motivo: "prioridade_maior",
          },
        }
      : {}),
  });
});

router.patch("/regras-professores/:professorId", async (req, res): Promise<void> => {
  const params = UpdateRegraReservaProfessorParams.safeParse(req.params);
  const parsed = UpdateRegraReservaProfessorBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: (!params.success ? params.error : parsed.error)?.message ?? "Dados invalidos." });
    return;
  }
  const escolaId = getEscolaId(req);
  const professor = await db
    .select()
    .from(professoresTable)
    .where(
      and(
        eq(professoresTable.id, params.data.professorId),
        eq(professoresTable.escolaId, escolaId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado." });
    return;
  }
  const [rule] = await db
    .insert(regrasReservaProfessorTable)
    .values({ escolaId, professorId: professor.id, ...parsed.data })
    .onConflictDoUpdate({
      target: [
        regrasReservaProfessorTable.escolaId,
        regrasReservaProfessorTable.professorId,
      ],
      set: parsed.data,
    })
    .returning();
  const { inicio, fim } = weekBounds(dateOnly(new Date()));
  const reservasNaSemana = await db
    .select({ id: reservasTable.id })
    .from(reservasTable)
    .where(
      and(
        eq(reservasTable.escolaId, escolaId),
        eq(reservasTable.professorId, professor.id),
        gte(reservasTable.data, inicio),
        lte(reservasTable.data, fim),
        ne(reservasTable.status, "cancelada"),
      ),
    );
  res.json(
    UpdateRegraReservaProfessorResponse.parse({
      professorId: professor.id,
      professorNome: professor.nome,
      limiteSemanal: rule.limiteSemanal,
      prioridade: rule.prioridade,
      reservasNaSemana: reservasNaSemana.length,
      regraId: rule.id,
    }),
  );
});

router.patch("/:id", async (req, res): Promise<void> => {
  const params = UpdateReservaParams.safeParse(req.params);
  const parsed = UpdateReservaBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: (!params.success ? params.error : parsed.error)?.message ?? "Dados invalidos." });
    return;
  }
  const escolaId = getEscolaId(req);
  const current = await getReserva(params.data.id, escolaId);
  if (!current) {
    res.status(404).json({ error: "Reserva não encontrada." });
    return;
  }
  if (parsed.data.status === "cancelada") {
    const [updated] = await db
      .update(reservasTable)
      .set({ status: "cancelada" })
      .where(eq(reservasTable.id, current.id))
      .returning();
    if (current.status !== "cancelada") {
      await db.insert(comunicadosTable).values({
        escolaId,
        titulo: "Reserva cancelada",
        mensagem: `Sua reserva "${current.titulo}" foi cancelada pela coordenacao.`,
        tipo: "reserva",
        professorId: current.professorId,
      });
    }
    const result = await publicReserva(updated);
    res.json(UpdateReservaResponse.parse(result));
    return;
  }

  const data = {
    salaId: parsed.data.salaId ?? current.salaId,
    professorId: parsed.data.professorId ?? current.professorId,
    data: parsed.data.data ? dateOnly(parsed.data.data) : current.data,
    diaSemana: parsed.data.diaSemana ?? current.diaSemana,
    numeroAula: parsed.data.numeroAula ?? current.numeroAula,
  };
  const validation = await validateReserva(escolaId, data, current.id);
  if ("error" in validation) {
    res.status(validation.status).json(validation);
    return;
  }
  // Se o pedido informou um status explicito (ex.: coordenacao
  // confirmando uma reserva pendente), respeita essa escolha manual.
  // Senao, usa o status calculado pela validacao (confirmada ou
  // pendente por limite semanal).
  const statusFinal = parsed.data.status ?? validation.statusInicial;
  const updated = await db.transaction(async (tx) => {
    if (validation.reservaParaDeslocar) {
      await tx
        .update(reservasTable)
        .set({ status: "pendente" })
        .where(eq(reservasTable.id, validation.reservaParaDeslocar.id));
    }
    const [row] = await tx
      .update(reservasTable)
      .set({
        ...data,
        horarioId: validation.horario.id,
        titulo: parsed.data.titulo ?? current.titulo,
        observacoes:
          parsed.data.observacoes === undefined
            ? current.observacoes
            : parsed.data.observacoes,
        status: statusFinal,
        prioridadeAplicada: validation.prioridade,
      })
      .where(eq(reservasTable.id, current.id))
      .returning();
    return row;
  });
  if (validation.reservaParaDeslocar) {
    await db.insert(comunicadosTable).values({
      escolaId,
      titulo: "Reserva movida para pendente",
      mensagem: `Sua reserva "${validation.reservaParaDeslocar.titulo}" foi movida para pendente por causa de outra reserva de prioridade maior no mesmo espaco.`,
      tipo: "reserva",
      professorId: validation.reservaParaDeslocar.professorId,
    });
  }
  if (current.status === "pendente" && statusFinal === "confirmada") {
    await db.insert(comunicadosTable).values({
      escolaId,
      titulo: "Reserva confirmada",
      mensagem: `Sua reserva "${updated.titulo}" foi confirmada.`,
      tipo: "reserva",
      professorId: updated.professorId,
    });
  }
  const result = await publicReserva(updated);
  res.json(UpdateReservaResponse.parse(result));
});

router.delete("/:id", async (req, res): Promise<void> => {
  const params = DeleteReservaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const escolaId = getEscolaId(req);
  const current = await getReserva(params.data.id, escolaId);
  if (!current) {
    res.status(404).json({ error: "Reserva não encontrada." });
    return;
  }
  await db
    .update(reservasTable)
    .set({ status: "cancelada" })
    .where(
      and(eq(reservasTable.id, current.id), eq(reservasTable.escolaId, escolaId)),
    );
  res.status(204).send();
});

export default router;


