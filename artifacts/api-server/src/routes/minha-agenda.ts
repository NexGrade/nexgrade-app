import { ocupacaoDoDia, ocupacaoDoMes } from "../lib/ocupacao-reservas"; // [OCUPACAO-SALAS] [CALENDARIO-RESERVA]
import { horarioSlotsTable } from "@workspace/db"; // [AGENDA-TURNOS]
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { emailVerificado } from "../lib/identidade"; // [ACESSOS-ESCOLA]
import { db } from "@workspace/db";
import {
  professoresTable,
  comunicadosTable,
  horariosTable,
  disciplinasTable,
  turmasTable,
  reservasTable,
  recursosTable, // [RECURSOS-TABLETS]
  reservasRecursosTable, // [RECURSOS-TABLETS]
  salasTable,
  disponibilidadeTable,
  escolasTable, // [PDF-AGENDA]
  calendarioEscolarTable, // [PDF-AGENDA]
} from "@workspace/db";
import { and, eq, gte, lte, ne, or, isNull, sql } from "drizzle-orm";
import { gerarPdfAgendaProfessor } from "../lib/pdf-agenda-professor"; // [PDF-AGENDA]
import { getEscolaId } from "../lib/escola-id";
import { ehHAOutroTurno } from "../lib/ha-contraturno"; // [HA-OUTRO-TURNO]
import { mapaRevezamento, hojeBrasil } from "../lib/revezamento-trio"; // [REVEZAMENTO-TRIO]
import { carregarAssSoTurma } from "../lib/assincrona-so-turma"; // [ASS-SO-TURMA]
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

  // [SIMPLIFICADO] Nao depende da tabela usuarios (que exigiria
  // vincular o clerkId ANTES da pessoa existir, impraticavel num
  // fluxo de convite). Busca o e-mail direto da conta Clerk logada e
  // compara com professores.email -- fonte de verdade unica, sem
  // necessidade de sincronizacao manual.
  // [ACESSOS-ESCOLA] e-mail verificado (lib/identidade.ts) e comparacao sem diferenciar
  // maiusculas/espacos, igual a regra de acesso do professor
  const email = await emailVerificado(req);
  if (!email) return null;

  const professor = await db
    .select()
    .from(professoresTable)
    .where(and(sql`lower(trim(${professoresTable.email})) = ${email}`, eq(professoresTable.escolaId, escolaId)))
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

// [PDF-AGENDA] dados da agenda (aulas oficiais, HA e horarios) usados pela tela e pelo PDF
async function dadosAgenda(professor: { id: number }, escolaId: string) {
  const linhasTodas = await db
    .select({
      diaSemana: horariosTable.diaSemana,
      numeroAula: horariosTable.numeroAula,
      sala: horariosTable.sala,
      disciplinaNome: disciplinasTable.nome,
      disciplinaSigla: disciplinasTable.sigla,
      assincrona: horariosTable.assincrona, // [ASSINCRONA-EXIBICAO]
      turmaId: horariosTable.turmaId, // [REVEZAMENTO-TRIO]
      disciplinaId: horariosTable.disciplinaId,
      disciplinaCor: disciplinasTable.cor,
      turmaNome: turmasTable.nome,
      turno: turmasTable.turno, // [AGENDA-TURNOS]
      nivelEnsino: turmasTable.nivelEnsino, // [ASS-SO-TURMA]
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
  // [ASS-SO-TURMA] a assincrona da 7a aula (nao letiva) e so da turma: fora da agenda do professor
  const ehAssSoTurma = await carregarAssSoTurma(escolaId);
  const linhas = linhasTodas.filter((l) => !ehAssSoTurma(l, { turno: l.turno, nivelEnsino: l.nivelEnsino }));

  // [HA] Hora-Atividade obrigatoria do professor -- slots vazios na
  // grade (sem aula de nenhuma turma) que ainda assim sao
  // "ocupados" por HA, pra distinguir de horario realmente livre.
  const horasAtividadeBrutas = await db
    .select({
      diaSemana: disponibilidadeTable.diaSemana,
      numeroAula: disponibilidadeTable.horarioSlot,
      turno: disponibilidadeTable.turno, // [AGENDA-TURNOS]
      motivo: disponibilidadeTable.motivo, // [HA-OUTRO-TURNO]
    })
    .from(disponibilidadeTable)
    .where(
      and(
        eq(disponibilidadeTable.professorId, professor.id),
        eq(disponibilidadeTable.horaAtividadeObrigatoria, true),
      ),
    );

  // [HA-OUTRO-TURNO] devolve so a marca (HA de aulas de outro turno = HA*), nunca o motivo
  const horasAtividade = horasAtividadeBrutas.map(({ motivo, ...h }) => ({ ...h, outroTurno: ehHAOutroTurno(motivo) }));

  // [AGENDA-TURNOS] horario de inicio de cada aula, por turno (esquema de aulas da escola)
  const slots = await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));
  const horarios: Array<{ turno: string; numeroAula: number; horaInicio: string }> = [];
  for (const s of slots) {
    if (s.letivo === false) continue;
    const turnoS = String(s.turno ?? "");
    if (!horarios.some((h) => h.turno === turnoS && h.numeroAula === s.numeroAula)) {
      horarios.push({ turno: turnoS, numeroAula: s.numeroAula, horaInicio: String(s.horaInicio ?? "") });
    }
  }

  // [REVEZAMENTO-TRIO] aula de trio: presencial ou suporte nesta semana
  const revez = await mapaRevezamento([...new Set(linhas.map((l) => l.turmaId))], hojeBrasil());
  const aulas = linhas.map(({ turmaId, disciplinaId, ...l }) => ({
    ...l,
    trio: l.assincrona ? null : revez.get(`${turmaId}|${disciplinaId}|${professor.id}`) ?? null,
  }));
  return { aulas, horasAtividade, horarios, slots };
}

router.get("/horario", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const { aulas, horasAtividade, horarios } = await dadosAgenda(professor, getEscolaId(req));
  res.json({ aulas, horasAtividade, horarios });
});

// [PDF-AGENDA] (17/10/2026) PDF da agenda do professor logado: semana atual (no sabado e
// domingo, a proxima), todos os turnos numa pagina A4 deitada, dias sem aula e reservas da semana.
const TIPOS_SEM_AULA: Record<string, string> = { feriado: "Feriado", recesso: "Recesso", ponto_facultativo: "Ponto facultativo", estudo_planejamento: "Estudo e planejamento" };
router.get("/agenda-pdf", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const escolaId = getEscolaId(req);
  const { aulas, horasAtividade, slots } = await dadosAgenda(professor, escolaId);

  const hoje = hojeBrasil();
  const dow = hoje.getUTCDay();
  const seg = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  seg.setUTCDate(seg.getUTCDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  const datasSemana = Array.from({ length: 5 }, (_, i) => {
    const x = new Date(seg);
    x.setUTCDate(seg.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });

  const [escola, eventos, reservas] = await Promise.all([
    db.select({ nome: escolasTable.nomeFantasia }).from(escolasTable).where(eq(escolasTable.id, escolaId)).then((r) => r[0]?.nome ?? "Escola"),
    db.select().from(calendarioEscolarTable).where(and(eq(calendarioEscolarTable.escolaId, escolaId), gte(calendarioEscolarTable.data, datasSemana[0]!), lte(calendarioEscolarTable.data, datasSemana[4]!))),
    db.select({ data: reservasTable.data, numeroAula: reservasTable.numeroAula, titulo: reservasTable.titulo, status: reservasTable.status, sala: salasTable.nome })
      .from(reservasTable)
      .innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
      .where(and(
        eq(reservasTable.professorId, professor.id),
        eq(reservasTable.escolaId, escolaId),
        ne(reservasTable.status, "cancelada"),
        gte(reservasTable.data, datasSemana[0]!),
        lte(reservasTable.data, datasSemana[4]!),
      ))
      .orderBy(reservasTable.data, reservasTable.numeroAula),
  ]);

  const semAula = datasSemana.flatMap((data, diaSemana) => {
    const e = eventos.find((x) => String(x.data) === data && TIPOS_SEM_AULA[x.tipo] && !x.diaLetivo);
    return e ? [{ diaSemana, rotulo: TIPOS_SEM_AULA[e.tipo]!, descricao: e.descricao }] : [];
  });

  // horario de inicio e fim de cada aula, por turno (o maior esquema do turno)
  const hhmm = (t: string) => t.slice(0, 5);
  const somar = (t: string, min: number) => {
    const [h, m] = t.split(":").map(Number);
    const tot = (h ?? 0) * 60 + (m ?? 0) + min;
    return `${String(Math.floor(tot / 60) % 24).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
  };
  const horarios: Array<{ turno: string; numeroAula: number; inicio: string; fim: string }> = [];
  for (const s of slots) {
    if (s.letivo === false || !s.horaInicio) continue;
    const turno = String(s.turno ?? "");
    if (horarios.some((h) => h.turno === turno && h.numeroAula === s.numeroAula)) continue;
    horarios.push({ turno, numeroAula: s.numeroAula, inicio: hhmm(String(s.horaInicio)), fim: somar(String(s.horaInicio), s.duracaoMinutos ?? 50) });
  }

  const pdf = await gerarPdfAgendaProfessor({
    escola,
    professor: professor.nome,
    datasSemana,
    aulas: aulas.map((a) => ({
      turno: String(a.turno ?? ""),
      diaSemana: a.diaSemana,
      numeroAula: a.numeroAula,
      turma: a.turmaNome,
      disciplina: a.disciplinaNome,
      cor: a.disciplinaCor,
      extra: a.assincrona ? "(ASS)" : a.trio ? (a.trio.presencial ? "(P)" : "(S)") : undefined,
    })),
    has: horasAtividade
      .filter((h) => !aulas.some((a) => a.turno === h.turno && a.diaSemana === h.diaSemana && a.numeroAula === h.numeroAula))
      .map((h) => ({ turno: String(h.turno ?? ""), diaSemana: h.diaSemana, numeroAula: h.numeroAula, outroTurno: h.outroTurno })),
    horarios,
    semAula,
    reservas: reservas.map((r) => ({ ...r, data: String(r.data) })),
  });
  const nomeArq = `agenda_${professor.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_")}_${datasSemana[0]}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeArq}"`);
  res.send(Buffer.from(pdf));
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
      turno: reservasTable.turno, // [RESERVA-TURNO]
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
  turno: z.string().optional(), // [RESERVA-TURNO]
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
  const validation = await validateReserva(escolaId, { ...data, turno: parsed.data.turno });
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
        turno: validation.turno, // [RESERVA-TURNO]
        titulo: parsed.data.titulo,
        observacoes: parsed.data.observacoes,
        prioridadeAplicada: validation.prioridade,
        status: statusFinal,
      })
      .returning();
    return row;
  });
  if (statusFinal === "pendente") {
    await db.insert(comunicadosTable).values({
      escolaId,
      titulo: "Nova reserva pendente",
      mensagem: `${professor.nome} solicitou "${parsed.data.titulo}" para ${parsed.data.data} (${parsed.data.numeroAula}a aula) -- aguardando confirmacao.`,
      tipo: "reserva",
      autorNome: professor.nome,
    });
  }
  const result = await publicReserva(created);
  res.status(201).json(result);
});

// [RESERVA-LOTE] (17/10/2026) varias aulas e varios espacos de uma vez, no mesmo dia e turno.
// Cada item e um espaco com as aulas dele. Confere tudo antes: se alguma aula nao puder,
// nada e gravado e a resposta diz qual (espaco + aula) e por que. [RESERVA-VARIOS-ESPACOS]
// a mesma aula pode ir para mais de um espaco (turma dividida); o mesmo espaco na mesma aula, nao.
const LoteMinhaReservaBody = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.string().min(1),
  itens: z.array(z.object({ salaId: z.number().int(), numerosAula: z.array(z.number().int().min(1)).min(1) })).min(1).max(10),
  titulo: z.string().min(1),
  observacoes: z.string().optional(),
});
router.post("/reservas/lote", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const parsed = LoteMinhaReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pedido de reserva incompleto." });
    return;
  }
  const escolaId = getEscolaId(req);
  const { data: dataISO, turno, itens, titulo, observacoes } = parsed.data;
  const d = new Date(`${dataISO}T12:00:00Z`).getUTCDay();
  const diaSemana = d === 0 ? 6 : d - 1;
  const pares = itens.flatMap((i) => i.numerosAula.map((n) => `${i.salaId}|${n}`));
  if (new Set(pares).size !== pares.length || new Set(itens.map((i) => i.salaId)).size !== itens.length) {
    res.status(400).json({ error: "O mesmo espaço aparece duas vezes na mesma aula. Confira a lista." });
    return;
  }
  const salas = await db.select({ id: salasTable.id, nome: salasTable.nome }).from(salasTable).where(eq(salasTable.escolaId, escolaId));
  const nomeSala = (id: number) => salas.find((s) => s.id === id)?.nome ?? "Espaço";

  const validacoes: Array<{ salaId: number; numeroAula: number; v: Extract<Awaited<ReturnType<typeof validateReserva>>, { horario: unknown }> }> = [];
  const problemas: Array<{ salaId: number; numeroAula: number; erro: string }> = [];
  for (const item of itens) {
    for (const numeroAula of item.numerosAula) {
      const v = await validateReserva(escolaId, { salaId: item.salaId, professorId: professor.id, data: dataISO, diaSemana, numeroAula, turno });
      if ("error" in v) problemas.push({ salaId: item.salaId, numeroAula, erro: v.error });
      else validacoes.push({ salaId: item.salaId, numeroAula, v });
    }
  }
  if (problemas.length) {
    res.status(409).json({
      error: problemas.map((p) => `${nomeSala(p.salaId)}, ${p.numeroAula}ª aula: ${p.erro}`).join(" "),
      problemas,
    });
    return;
  }

  const rule = await db
    .select()
    .from(regrasReservaProfessorTable)
    .where(and(eq(regrasReservaProfessorTable.professorId, professor.id), eq(regrasReservaProfessorTable.escolaId, escolaId)))
    .then((r) => r[0] ?? null);
  const prioridadeProfessor = rule?.prioridade ?? 3;
  let criadas: Array<typeof reservasTable.$inferSelect> = [];
  try {
    criadas = await db.transaction(async (tx) => {
      const linhas: Array<typeof reservasTable.$inferSelect> = [];
      for (const [i, { salaId, numeroAula, v }] of validacoes.entries()) {
        if (v.reservaParaDeslocar) {
          await tx.update(reservasTable).set({ status: "pendente" }).where(eq(reservasTable.id, v.reservaParaDeslocar.id));
        }
        // limite semanal conta tambem as aulas deste mesmo pedido
        const passouLimite = v.reservasNaSemana + i >= v.limiteSemanal;
        const status = prioridadeProfessor >= 4 && !passouLimite ? "confirmada" : "pendente";
        const [row] = await tx
          .insert(reservasTable)
          .values({ escolaId, salaId, professorId: professor.id, data: dataISO, diaSemana, numeroAula, turno: v.turno ?? turno, horarioId: v.horario.id, titulo, observacoes, prioridadeAplicada: v.prioridade, status })
          .returning();
        linhas.push(row!);
      }
      return linhas;
    });
  } catch {
    res.status(409).json({ error: "Alguma dessas aulas acabou de ser reservada por outra pessoa. Atualize e tente de novo." });
    return;
  }
  const pendentes = criadas.filter((r) => r.status === "pendente");
  if (pendentes.length) {
    const resumo = [...new Set(pendentes.map((r) => r.salaId))].map((s) => `${nomeSala(s)} (${pendentes.filter((r) => r.salaId === s).map((r) => `${r.numeroAula}ª`).join(", ")} aula)`).join("; ");
    await db.insert(comunicadosTable).values({
      escolaId,
      titulo: "Nova reserva pendente",
      mensagem: `${professor.nome} solicitou "${titulo}" para ${dataISO}: ${resumo} -- aguardando confirmacao.`,
      tipo: "reserva",
      autorNome: professor.nome,
    });
  }
  res.status(201).json({ criadas: criadas.length, confirmadas: criadas.length - pendentes.length, pendentes: pendentes.length });
});

// [RECURSOS-TABLETS] (17/10/2026) Equipamento contado por unidade (carrinho de tablets).
// Confirma na hora, sem escolher espaco; varios professores na mesma aula ate o total do recurso.
const RECURSO_PADRAO = { nome: "Tablets", quantidadeTotal: 30 };

class ErroRecurso extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// cria o recurso padrao da escola na primeira consulta (sem depender de seed no banco)
async function garantirRecursos(escolaId: string) {
  await db
    .insert(recursosTable)
    .values({ escolaId, ...RECURSO_PADRAO })
    .onConflictDoNothing();
  return db.select().from(recursosTable).where(and(eq(recursosTable.escolaId, escolaId), eq(recursosTable.ativo, true))).orderBy(recursosTable.nome);
}

router.get("/recursos/ocupacao", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const q = req.query.data;
  const data = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
  if (!data) {
    res.status(400).json({ error: "Informe a data (AAAA-MM-DD)." });
    return;
  }
  const escolaId = getEscolaId(req);
  const recursos = await garantirRecursos(escolaId);
  const linhas = await db
    .select({
      recursoId: reservasRecursosTable.recursoId,
      numeroAula: reservasRecursosTable.numeroAula,
      turno: reservasRecursosTable.turno,
      reservadas: sql<number>`coalesce(sum(${reservasRecursosTable.quantidade}), 0)::int`,
    })
    .from(reservasRecursosTable)
    .where(and(eq(reservasRecursosTable.escolaId, escolaId), eq(reservasRecursosTable.data, data), ne(reservasRecursosTable.status, "cancelada")))
    .groupBy(reservasRecursosTable.recursoId, reservasRecursosTable.numeroAula, reservasRecursosTable.turno);
  res.json({
    data,
    recursos: recursos.map((r) => ({
      id: r.id,
      nome: r.nome,
      total: r.quantidadeTotal,
      ocupacao: linhas.filter((l) => l.recursoId === r.id).map((l) => ({ numeroAula: l.numeroAula, turno: l.turno, reservadas: l.reservadas })),
    })),
  });
});

router.get("/recursos/reservas", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = await db
    .select({
      id: reservasRecursosTable.id,
      data: reservasRecursosTable.data,
      diaSemana: reservasRecursosTable.diaSemana,
      numeroAula: reservasRecursosTable.numeroAula,
      turno: reservasRecursosTable.turno,
      quantidade: reservasRecursosTable.quantidade,
      titulo: reservasRecursosTable.titulo,
      observacoes: reservasRecursosTable.observacoes,
      status: reservasRecursosTable.status,
      recursoNome: recursosTable.nome,
    })
    .from(reservasRecursosTable)
    .innerJoin(recursosTable, eq(recursosTable.id, reservasRecursosTable.recursoId))
    .where(
      and(
        eq(reservasRecursosTable.professorId, professor.id),
        eq(reservasRecursosTable.escolaId, getEscolaId(req)),
        ne(reservasRecursosTable.status, "cancelada"),
        gte(reservasRecursosTable.data, hoje),
      ),
    )
    .orderBy(reservasRecursosTable.data, reservasRecursosTable.numeroAula);
  res.json(linhas);
});

const ReservaRecursoBody = z.object({
  recursoId: z.number().int(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.string().min(1),
  // quantidade por aula, tudo gravado numa transacao so
  itens: z.array(z.object({ numeroAula: z.number().int().min(1), quantidade: z.number().int().min(1) })).min(1).max(10),
  titulo: z.string().min(1),
  observacoes: z.string().optional(),
});

router.post("/recursos/reservas", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const parsed = ReservaRecursoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pedido de reserva incompleto." });
    return;
  }
  const escolaId = getEscolaId(req);
  const { recursoId, data, turno, itens, titulo, observacoes } = parsed.data;
  const numerosAula = itens.map((i) => i.numeroAula);
  if (new Set(numerosAula).size !== numerosAula.length) {
    res.status(400).json({ error: "A mesma aula aparece duas vezes. Confira a lista." });
    return;
  }
  const d = new Date(`${data}T12:00:00Z`).getUTCDay();
  const diaSemana = d === 0 ? 6 : d - 1;
  if (diaSemana > 4) {
    res.status(400).json({ error: "O dia precisa estar entre segunda e sexta-feira." });
    return;
  }
  if (data < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Não é possível reservar em uma data que já passou." });
    return;
  }

  try {
    // a reserva e para a aula do proprio professor (mesma regra dos espacos)
    const minhasAulas = await db
      .select({ numeroAula: horariosTable.numeroAula })
      .from(horariosTable)
      .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
      .where(
        and(
          eq(horariosTable.escolaId, escolaId),
          eq(horariosTable.professorId, professor.id),
          eq(horariosTable.diaSemana, diaSemana),
          eq(turmasTable.turno, turno),
          or(eq(horariosTable.versaoGrade, "oficial"), isNull(horariosTable.versaoGrade)),
        ),
      );
    const semAula = numerosAula.filter((n) => !minhasAulas.some((a) => a.numeroAula === n));
    if (semAula.length) {
      throw new ErroRecurso(409, `Você não tem aula na ${semAula.map((n) => `${n}ª`).join(", ")} aula desse dia e período.`);
    }

    const criadas = await db.transaction(async (tx) => {
      // trava a linha do recurso: dois pedidos ao mesmo tempo esperam um pelo outro, e a soma nunca passa do total
      const [recurso] = await tx
        .select()
        .from(recursosTable)
        .where(and(eq(recursosTable.id, recursoId), eq(recursosTable.escolaId, escolaId), eq(recursosTable.ativo, true)))
        .for("update");
      if (!recurso) throw new ErroRecurso(404, "Equipamento não encontrado.");
      const problemas: string[] = [];
      for (const { numeroAula, quantidade } of itens) {
        const [linha] = await tx
          .select({ reservadas: sql<number>`coalesce(sum(${reservasRecursosTable.quantidade}), 0)::int` })
          .from(reservasRecursosTable)
          .where(
            and(
              eq(reservasRecursosTable.escolaId, escolaId),
              eq(reservasRecursosTable.recursoId, recursoId),
              eq(reservasRecursosTable.data, data),
              eq(reservasRecursosTable.numeroAula, numeroAula),
              eq(reservasRecursosTable.turno, turno),
              ne(reservasRecursosTable.status, "cancelada"),
            ),
          );
        const [minha] = await tx
          .select({ id: reservasRecursosTable.id })
          .from(reservasRecursosTable)
          .where(
            and(
              eq(reservasRecursosTable.escolaId, escolaId),
              eq(reservasRecursosTable.recursoId, recursoId),
              eq(reservasRecursosTable.professorId, professor.id),
              eq(reservasRecursosTable.data, data),
              eq(reservasRecursosTable.numeroAula, numeroAula),
              eq(reservasRecursosTable.turno, turno),
              ne(reservasRecursosTable.status, "cancelada"),
            ),
          );
        if (minha) {
          problemas.push(`${numeroAula}ª aula: você já reservou ${recurso.nome.toLowerCase()} nessa aula (cancele a reserva para refazer).`);
          continue;
        }
        const restam = recurso.quantidadeTotal - (linha?.reservadas ?? 0);
        if (quantidade > restam) {
          problemas.push(`${numeroAula}ª aula: restam ${restam} de ${recurso.quantidadeTotal}.`);
        }
      }
      if (problemas.length) throw new ErroRecurso(409, `Não há ${recurso.nome.toLowerCase()} suficientes. ${problemas.join(" ")}`);
      return tx
        .insert(reservasRecursosTable)
        .values(itens.map(({ numeroAula, quantidade }) => ({ escolaId, recursoId, professorId: professor.id, data, diaSemana, numeroAula, turno, quantidade, titulo, observacoes, status: "confirmada" })))
        .returning();
    });
    res.status(201).json({ criadas: criadas.length, confirmadas: criadas.length, pendentes: 0 });
  } catch (err) {
    if (err instanceof ErroRecurso) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// o professor cancela a PROPRIA reserva de equipamento; as unidades voltam na hora
router.delete("/recursos/reservas/:id", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Reserva inválida." });
    return;
  }
  const [row] = await db
    .update(reservasRecursosTable)
    .set({ status: "cancelada" })
    .where(and(eq(reservasRecursosTable.id, id), eq(reservasRecursosTable.professorId, professor.id), eq(reservasRecursosTable.escolaId, getEscolaId(req)), ne(reservasRecursosTable.status, "cancelada")))
    .returning({ id: reservasRecursosTable.id });
  if (!row) {
    res.status(404).json({ error: "Reserva não encontrada." });
    return;
  }
  res.json({ ok: true });
});

// [NOTIFICACOES] Lista notificacoes visiveis para o professor logado:
// gerais (professorId null) + as direcionadas especificamente a ele.
// [OCUPACAO-SALAS] ocupacao dos espacos num dia (sem nomes), para o professor
// ver o que esta livre antes de reservar.
router.get("/ocupacao", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const q = req.query.data;
  const data = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
  if (!data) {
    res.status(400).json({ error: "Informe a data (AAAA-MM-DD)." });
    return;
  }
  res.json(await ocupacaoDoDia(getEscolaId(req), data));
});

// [CALENDARIO-RESERVA] ocupacao de um espaco no mes (sem nomes), para o calendario
// da "Nova reserva".
router.get("/ocupacao-mes", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const salaId = Number(req.query.salaId);
  const mes = typeof req.query.mes === "string" && /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : null;
  if (!Number.isInteger(salaId) || salaId <= 0 || !mes) {
    res.status(400).json({ error: "Informe o espaço (salaId) e o mês (AAAA-MM)." });
    return;
  }
  res.json(await ocupacaoDoMes(getEscolaId(req), salaId, mes));
});

router.get("/notificacoes", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const escolaId = getEscolaId(req);
  const linhas = await db
    .select()
    .from(comunicadosTable)
    .where(
      and(
        eq(comunicadosTable.escolaId, escolaId),
        or(isNull(comunicadosTable.professorId), eq(comunicadosTable.professorId, professor.id)),
      ),
    )
    .orderBy(comunicadosTable.createdAt);
  res.json(linhas.reverse());
});

router.patch("/notificacoes/:id/lida", async (req, res) => {
  const professor = await resolverProfessorLogado(req);
  if (!professor) {
    res.status(404).json({ error: "Nenhum professor vinculado a esta conta." });
    return;
  }
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  const [atualizado] = await db
    .update(comunicadosTable)
    .set({ lida: true })
    .where(and(eq(comunicadosTable.id, id), eq(comunicadosTable.escolaId, escolaId)))
    .returning();
  if (!atualizado) {
    res.status(404).json({ error: "Notificacao nao encontrada." });
    return;
  }
  res.json(atualizado);
});

// [ICS-SERVIDOR] Gera o arquivo .ics no backend, com Content-Type
// correto -- baixar via blob no navegador nao funciona de forma
// confiavel no Safari do iPhone (limitacao conhecida do WebKit com
// o atributo download em blobs). Servindo do servidor com os
// cabecalhos certos, o celular reconhece e oferece "Adicionar ao
// Calendario" nativamente.
export default router;
