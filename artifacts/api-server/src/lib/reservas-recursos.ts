import { and, asc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, horariosTable, recursosTable, reservasRecursosTable, turmasTable } from "@workspace/db";
import { bloqueiosAtivos, maxAulaDaEscola, slotsDoBloqueio, unidadesBloqueadas } from "./bloqueios"; // [BLOQUEIOS]

// [RECURSOS-TABLETS] (17/10/2026) Equipamento contado por unidade (carrinho de tablets).
// Confirma na hora, sem escolher espaco; varios professores na mesma aula ate o total do recurso.
// Usado pelo professor (Minha Agenda) e pelo gestor de reservas (portal).
const RECURSO_PADRAO = { nome: "Tablets", quantidadeTotal: 30 };

class ErroRecurso extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// cria o recurso padrao da escola na primeira consulta (sem depender de seed no banco)
export async function garantirRecursos(escolaId: string) {
  await db
    .insert(recursosTable)
    .values({ escolaId, ...RECURSO_PADRAO })
    .onConflictDoNothing();
  return db.select().from(recursosTable).where(and(eq(recursosTable.escolaId, escolaId), eq(recursosTable.ativo, true))).orderBy(recursosTable.nome);
}

export async function ocupacaoRecursosDoDia(escolaId: string, data: string) {
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
  // [BLOQUEIOS] unidades bloqueadas (manutencao, limpeza...) por periodo e aula; saem do saldo como as reservas
  const bloqueios = (await bloqueiosAtivos(escolaId, data, data)).filter((b) => b.alvoTipo === "recurso");
  const maxAula = bloqueios.length ? await maxAulaDaEscola(escolaId) : 0;
  return {
    data,
    recursos: recursos.map((r) => {
      const porSlot = new Map<string, { numeroAula: number; turno: string; reservadas: number; bloqueadas: number }>();
      for (const l of linhas.filter((x) => x.recursoId === r.id)) porSlot.set(`${l.turno}|${l.numeroAula}`, { numeroAula: l.numeroAula, turno: l.turno, reservadas: l.reservadas, bloqueadas: 0 });
      for (const b of bloqueios.filter((x) => x.recursoId === r.id)) {
        const { turnos, aulas } = slotsDoBloqueio(b, maxAula);
        for (const turno of turnos) {
          for (const numeroAula of aulas) {
            const linha = porSlot.get(`${turno}|${numeroAula}`) ?? { numeroAula, turno, reservadas: 0, bloqueadas: 0 };
            linha.bloqueadas = Math.min(r.quantidadeTotal, linha.bloqueadas + (b.quantidade ?? r.quantidadeTotal));
            porSlot.set(`${turno}|${numeroAula}`, linha);
          }
        }
      }
      return { id: r.id, nome: r.nome, total: r.quantidadeTotal, ocupacao: [...porSlot.values()] };
    }),
  };
}

export const ReservaRecursoBody = z.object({
  recursoId: z.number().int(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.string().min(1),
  // quantidade por aula, tudo gravado numa transacao so
  itens: z.array(z.object({ numeroAula: z.number().int().min(1), quantidade: z.number().int().min(1) })).min(1).max(10),
  titulo: z.string().min(1),
  observacoes: z.string().optional(),
});

export type ResultadoRecursos = { status: number; body: Record<string, unknown> };

export async function criarReservasRecursos(p: {
  escolaId: string;
  professor: { id: number };
  corpo: z.infer<typeof ReservaRecursoBody>;
}): Promise<ResultadoRecursos> {
  const { escolaId, professor } = p;
  const { recursoId, data, turno, itens, titulo, observacoes } = p.corpo;
  const numerosAula = itens.map((i) => i.numeroAula);
  if (new Set(numerosAula).size !== numerosAula.length) {
    return { status: 400, body: { error: "A mesma aula aparece duas vezes. Confira a lista." } };
  }
  const d = new Date(`${data}T12:00:00Z`).getUTCDay();
  const diaSemana = d === 0 ? 6 : d - 1;
  if (diaSemana > 4) return { status: 400, body: { error: "O dia precisa estar entre segunda e sexta-feira." } };
  if (data < new Date().toISOString().slice(0, 10)) {
    return { status: 400, body: { error: "Não é possível reservar em uma data que já passou." } };
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
      throw new ErroRecurso(409, `O professor não tem aula na ${semAula.map((n) => `${n}ª`).join(", ")} aula desse dia e período.`);
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
      const bloqueios = await bloqueiosAtivos(escolaId, data, data, { recursoId }, tx); // [BLOQUEIOS]
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
        const [jaTem] = await tx
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
        if (jaTem) {
          problemas.push(`${numeroAula}ª aula: já há reserva de ${recurso.nome.toLowerCase()} do professor nessa aula (cancele para refazer).`);
          continue;
        }
        const bloqueadas = unidadesBloqueadas(bloqueios, recurso.quantidadeTotal, data, turno, numeroAula); // [BLOQUEIOS]
        const restam = Math.max(0, recurso.quantidadeTotal - (linha?.reservadas ?? 0) - bloqueadas);
        if (quantidade > restam) problemas.push(`${numeroAula}ª aula: restam ${restam} de ${recurso.quantidadeTotal}${bloqueadas > 0 ? ` (${bloqueadas} bloqueados)` : ""}.`);
      }
      if (problemas.length) throw new ErroRecurso(409, `Não há ${recurso.nome.toLowerCase()} suficientes. ${problemas.join(" ")}`);
      return tx
        .insert(reservasRecursosTable)
        .values(itens.map(({ numeroAula, quantidade }) => ({ escolaId, recursoId, professorId: professor.id, data, diaSemana, numeroAula, turno, quantidade, titulo, observacoes, status: "confirmada" })))
        .returning();
    });
    return { status: 201, body: { criadas: criadas.length, confirmadas: criadas.length, pendentes: 0 } };
  } catch (err) {
    if (err instanceof ErroRecurso) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

// [RECURSOS-CONFIG] (17/10/2026) a coordenacao ajusta o total do equipamento (ex.: carrinho de tablets).
// So reduz se nenhuma reserva futura passar do novo total; a conferencia trava a linha do recurso, como a reserva.
export const AlterarRecursoBody = z.object({ quantidadeTotal: z.number().int().min(1).max(500) });

export async function alterarTotalRecurso(p: { escolaId: string; id: number; quantidadeTotal: number }): Promise<ResultadoRecursos> {
  const { escolaId, id, quantidadeTotal } = p;
  const hoje = new Date().toISOString().slice(0, 10);
  return db.transaction(async (tx) => {
    const [recurso] = await tx
      .select()
      .from(recursosTable)
      .where(and(eq(recursosTable.id, id), eq(recursosTable.escolaId, escolaId)))
      .for("update");
    if (!recurso) return { status: 404, body: { error: "Equipamento não encontrado." } };
    const [excede] = await tx
      .select({
        data: reservasRecursosTable.data,
        numeroAula: reservasRecursosTable.numeroAula,
        turno: reservasRecursosTable.turno,
        total: sql<number>`sum(${reservasRecursosTable.quantidade})::int`,
      })
      .from(reservasRecursosTable)
      .where(and(eq(reservasRecursosTable.escolaId, escolaId), eq(reservasRecursosTable.recursoId, id), gte(reservasRecursosTable.data, hoje), ne(reservasRecursosTable.status, "cancelada")))
      .groupBy(reservasRecursosTable.data, reservasRecursosTable.numeroAula, reservasRecursosTable.turno)
      .having(sql`sum(${reservasRecursosTable.quantidade}) > ${quantidadeTotal}`)
      .orderBy(asc(reservasRecursosTable.data), asc(reservasRecursosTable.numeroAula))
      .limit(1);
    if (excede) {
      const dia = `${String(excede.data).slice(8, 10)}/${String(excede.data).slice(5, 7)}`;
      return {
        status: 409,
        body: { error: `Já há ${excede.total} ${recurso.nome.toLowerCase()} reservados em ${dia} (${excede.numeroAula}ª aula). Cancele ou reduza essas reservas antes de diminuir o total para ${quantidadeTotal}.` },
      };
    }
    const [atualizado] = await tx.update(recursosTable).set({ quantidadeTotal }).where(eq(recursosTable.id, id)).returning();
    return { status: 200, body: { id: atualizado!.id, nome: atualizado!.nome, quantidadeTotal: atualizado!.quantidadeTotal } };
  });
}
