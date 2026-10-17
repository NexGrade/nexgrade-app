import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, horariosTable, recursosTable, reservasRecursosTable, turmasTable } from "@workspace/db";

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
  return {
    data,
    recursos: recursos.map((r) => ({
      id: r.id,
      nome: r.nome,
      total: r.quantidadeTotal,
      ocupacao: linhas.filter((l) => l.recursoId === r.id).map((l) => ({ numeroAula: l.numeroAula, turno: l.turno, reservadas: l.reservadas })),
    })),
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
        const restam = recurso.quantidadeTotal - (linha?.reservadas ?? 0);
        if (quantidade > restam) problemas.push(`${numeroAula}ª aula: restam ${restam} de ${recurso.quantidadeTotal}.`);
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
