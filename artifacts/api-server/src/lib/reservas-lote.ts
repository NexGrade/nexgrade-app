import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { comunicadosTable, db, regrasReservaProfessorTable, reservasTable, salasTable } from "@workspace/db";
import { validateReserva } from "../routes/reservas";

// [RESERVA-LOTE] (17/10/2026) varias aulas e varios espacos de uma vez, no mesmo dia e turno.
// Cada item e um espaco com as aulas dele. Confere tudo antes: se alguma aula nao puder,
// nada e gravado e a resposta diz qual (espaco + aula) e por que. [RESERVA-VARIOS-ESPACOS]
// a mesma aula pode ir para mais de um espaco (turma dividida); o mesmo espaco na mesma aula, nao.
// Usado pelo professor (Minha Agenda) e pelo gestor de reservas (portal).
export const LoteReservaBody = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.string().min(1),
  itens: z.array(z.object({ salaId: z.number().int(), numerosAula: z.array(z.number().int().min(1)).min(1) })).min(1).max(10),
  titulo: z.string().min(1),
  observacoes: z.string().optional(),
});

export type ResultadoLote = { status: number; body: Record<string, unknown> };

export async function criarLoteReservas(p: {
  escolaId: string;
  professor: { id: number; nome: string };
  corpo: z.infer<typeof LoteReservaBody>;
  /** gestor de reservas: tudo nasce confirmado, sem fila de aprovacao nem limite semanal */
  aprovarDireto: boolean;
}): Promise<ResultadoLote> {
  const { escolaId, professor, corpo, aprovarDireto } = p;
  const { data: dataISO, turno, itens, titulo, observacoes } = corpo;
  const d = new Date(`${dataISO}T12:00:00Z`).getUTCDay();
  const diaSemana = d === 0 ? 6 : d - 1;
  const pares = itens.flatMap((i) => i.numerosAula.map((n) => `${i.salaId}|${n}`));
  if (new Set(pares).size !== pares.length || new Set(itens.map((i) => i.salaId)).size !== itens.length) {
    return { status: 400, body: { error: "O mesmo espaço aparece duas vezes na mesma aula. Confira a lista." } };
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
    return {
      status: 409,
      body: {
        error: problemas.map((q) => `${nomeSala(q.salaId)}, ${q.numeroAula}ª aula: ${q.erro}`).join(" "),
        problemas,
      },
    };
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
        const status = aprovarDireto || (prioridadeProfessor >= 4 && !passouLimite) ? "confirmada" : "pendente";
        const [row] = await tx
          .insert(reservasTable)
          .values({ escolaId, salaId, professorId: professor.id, data: dataISO, diaSemana, numeroAula, turno: v.turno ?? turno, horarioId: v.horario.id, titulo, observacoes, prioridadeAplicada: v.prioridade, status })
          .returning();
        linhas.push(row!);
      }
      return linhas;
    });
  } catch {
    return { status: 409, body: { error: "Alguma dessas aulas acabou de ser reservada por outra pessoa. Atualize e tente de novo." } };
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
  return { status: 201, body: { criadas: criadas.length, confirmadas: criadas.length - pendentes.length, pendentes: pendentes.length } };
}
