import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { bloqueiosTable, comunicadosTable, db, recursosTable, reservasRecursosTable, reservasTable, salasTable } from "@workspace/db";
import { acessoDe } from "../lib/acesso";
import { bloqueiaSlot, bloqueiosAtivos, MOTIVOS, rotuloMotivo, TURNOS, unidadesBloqueadas } from "../lib/bloqueios";
import { getEscolaId } from "../lib/escola-id";

// [BLOQUEIOS] (17/10/2026) Bloqueio de salas e equipamentos (manutencao, limpeza, outro motivo) pelo gestor de
// reservas, coordenacao, direcao e secretaria. Montado em /reservas/bloqueios: a regra de acesso ja libera a
// escrita em /reservas/* so para quem administra reservas e bloqueia o professor (lib/permissao.ts).
const router = Router();

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CriarBloqueioBody = z
  .object({
    alvoTipo: z.enum(["sala", "recurso"]),
    alvoId: z.number().int(),
    quantidade: z.number().int().min(1).max(500).optional(), // so equipamento; sem ela = todas as unidades
    dataInicio: z.string().regex(ISO),
    dataFim: z.string().regex(ISO),
    turno: z.enum(TURNOS).nullable().optional(),
    numerosAula: z.array(z.number().int().min(1).max(12)).max(12).nullable().optional(), // vazio/nulo = dia inteiro
    motivo: z.enum(MOTIVOS),
    descricao: z.string().trim().max(200).optional(),
    somenteConferir: z.boolean().optional(), // simula: devolve o impacto sem gravar
  })
  .refine((b) => b.dataFim >= b.dataInicio, { message: "A data final não pode ser antes da inicial." })
  .refine((b) => (new Date(`${b.dataFim}T12:00:00Z`).getTime() - new Date(`${b.dataInicio}T12:00:00Z`).getTime()) / 86_400_000 <= 366, { message: "O período do bloqueio passa de 1 ano." })
  .refine((b) => b.motivo !== "outro" || !!b.descricao?.trim(), { message: "Descreva o motivo." });

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function quemBloqueou(req: Parameters<typeof getEscolaId>[0]): string {
  return acessoDe(req)?.email ?? getAuth(req).userId ?? "Sistema";
}

// lista os bloqueios ativos: de um dia (?data=) ou todos que ainda nao terminaram
router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const q = req.query.data;
  const dia = typeof q === "string" && ISO.test(q) ? q : null;
  const hoje = new Date().toISOString().slice(0, 10);
  const inicio = dia ?? hoje;
  const fim = dia ?? "9999-12-31";
  const lista = await bloqueiosAtivos(escolaId, inicio, fim);
  const [salas, recursos] = await Promise.all([
    db.select({ id: salasTable.id, nome: salasTable.nome }).from(salasTable).where(eq(salasTable.escolaId, escolaId)),
    db.select({ id: recursosTable.id, nome: recursosTable.nome }).from(recursosTable).where(eq(recursosTable.escolaId, escolaId)),
  ]);
  res.json(
    lista
      .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || a.id - b.id)
      .map((b) => ({
        id: b.id,
        alvoTipo: b.alvoTipo,
        alvoId: b.alvoTipo === "sala" ? b.salaId : b.recursoId,
        alvoNome: (b.alvoTipo === "sala" ? salas.find((s) => s.id === b.salaId)?.nome : recursos.find((r) => r.id === b.recursoId)?.nome) ?? "—",
        quantidade: b.quantidade,
        dataInicio: b.dataInicio,
        dataFim: b.dataFim,
        turno: b.turno,
        numerosAula: b.numerosAula ?? [],
        motivo: b.motivo,
        motivoRotulo: rotuloMotivo(b),
        descricao: b.descricao,
        criadoPor: b.criadoPor,
        createdAt: b.createdAt,
      })),
  );
});

router.post("/", async (req, res) => {
  const parsed = CriarBloqueioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados do bloqueio incompletos." });
    return;
  }
  const escolaId = getEscolaId(req);
  const b = parsed.data;
  const aulas = b.numerosAula && b.numerosAula.length > 0 ? [...new Set(b.numerosAula)].sort((x, y) => x - y) : null;
  const turno = b.turno ?? null;
  const rascunho = { dataInicio: b.dataInicio, dataFim: b.dataFim, turno, numerosAula: aulas };

  try {
    const resultado = await db.transaction(async (tx) => {
      if (b.alvoTipo === "sala") {
        const [sala] = await tx.select().from(salasTable).where(and(eq(salasTable.id, b.alvoId), eq(salasTable.escolaId, escolaId)));
        if (!sala) return { status: 404, body: { error: "Espaço não encontrado." } };
        // reservas ativas que caem no bloqueio: viram "pendente" (a coordenacao decide) e o professor e avisado
        const doPeriodo = await tx
          .select({ id: reservasTable.id, professorId: reservasTable.professorId, titulo: reservasTable.titulo, data: reservasTable.data, numeroAula: reservasTable.numeroAula, turno: reservasTable.turno, status: reservasTable.status })
          .from(reservasTable)
          .where(and(eq(reservasTable.escolaId, escolaId), eq(reservasTable.salaId, sala.id), gte(reservasTable.data, b.dataInicio), lte(reservasTable.data, b.dataFim), ne(reservasTable.status, "cancelada")));
        const afetadas = doPeriodo.filter((r) => bloqueiaSlot(rascunho, r.data, r.turno, r.numeroAula));
        if (b.somenteConferir) return { status: 200, body: { reservasAfetadas: afetadas.length, reservas: afetadas.slice(0, 20).map((r) => ({ data: r.data, numeroAula: r.numeroAula, titulo: r.titulo, status: r.status })) } };

        const [criado] = await tx
          .insert(bloqueiosTable)
          .values({ escolaId, alvoTipo: "sala", salaId: sala.id, dataInicio: b.dataInicio, dataFim: b.dataFim, turno, numerosAula: aulas, motivo: b.motivo, descricao: b.descricao?.trim() || null, criadoPor: quemBloqueou(req) })
          .returning();
        const aMover = afetadas.filter((r) => r.status === "confirmada");
        if (aMover.length) {
          await tx.update(reservasTable).set({ status: "pendente" }).where(and(eq(reservasTable.escolaId, escolaId), sql`${reservasTable.id} in ${aMover.map((r) => r.id)}`));
        }
        const porProfessor = new Map<number, typeof afetadas>();
        for (const r of afetadas) porProfessor.set(r.professorId, [...(porProfessor.get(r.professorId) ?? []), r]);
        for (const [professorId, lista] of porProfessor) {
          const ex = lista.slice(0, 4).map((r) => `${dataBR(r.data)} ${r.numeroAula}ª aula`).join(", ") + (lista.length > 4 ? "…" : "");
          await tx.insert(comunicadosTable).values({
            escolaId,
            titulo: "Espaço bloqueado: reserva a revisar",
            mensagem: `${sala.nome} foi bloqueado (${rotuloMotivo(criado!)}). ${lista.length === 1 ? "Sua reserva" : `${lista.length} reservas suas`} nesse período (${ex}) ficou pendente e a coordenação vai entrar em contato.`,
            tipo: "reserva",
            professorId,
          });
        }
        return { status: 201, body: { id: criado!.id, reservasAfetadas: afetadas.length } };
      }

      // equipamento por quantidade: trava a linha do recurso (mesma trava da reserva) e confere o saldo
      const [recurso] = await tx.select().from(recursosTable).where(and(eq(recursosTable.id, b.alvoId), eq(recursosTable.escolaId, escolaId), eq(recursosTable.ativo, true))).for("update");
      if (!recurso) return { status: 404, body: { error: "Equipamento não encontrado." } };
      const quantidade = b.quantidade ?? recurso.quantidadeTotal;
      if (quantidade > recurso.quantidadeTotal) return { status: 409, body: { error: `A escola tem ${recurso.quantidadeTotal} ${recurso.nome.toLowerCase()} no total.` } };
      const [reservadasPorSlot, outros] = await Promise.all([
        tx
          .select({ data: reservasRecursosTable.data, numeroAula: reservasRecursosTable.numeroAula, turno: reservasRecursosTable.turno, total: sql<number>`sum(${reservasRecursosTable.quantidade})::int` })
          .from(reservasRecursosTable)
          .where(and(eq(reservasRecursosTable.escolaId, escolaId), eq(reservasRecursosTable.recursoId, recurso.id), gte(reservasRecursosTable.data, b.dataInicio), lte(reservasRecursosTable.data, b.dataFim), ne(reservasRecursosTable.status, "cancelada")))
          .groupBy(reservasRecursosTable.data, reservasRecursosTable.numeroAula, reservasRecursosTable.turno)
          .orderBy(asc(reservasRecursosTable.data), asc(reservasRecursosTable.numeroAula)),
        bloqueiosAtivos(escolaId, b.dataInicio, b.dataFim, { recursoId: recurso.id }, tx),
      ]);
      // so recusa quando ja ha reservas demais para o que sobraria; o saldo livre nao e problema
      const conflitos = reservadasPorSlot.filter((s) => bloqueiaSlot(rascunho, s.data, s.turno, s.numeroAula) && s.total + unidadesBloqueadas(outros, recurso.quantidadeTotal, s.data, s.turno, s.numeroAula) + quantidade > recurso.quantidadeTotal);
      if (conflitos.length) {
        const c = conflitos[0]!;
        const sobra = Math.max(0, recurso.quantidadeTotal - c.total - unidadesBloqueadas(outros, recurso.quantidadeTotal, c.data, c.turno, c.numeroAula));
        return {
          status: 409,
          body: { error: `Em ${dataBR(c.data)} (${c.numeroAula}ª aula) já há ${c.total} ${recurso.nome.toLowerCase()} reservados: só dá para bloquear ${sobra}. Peça aos professores para cancelar ou reduza a quantidade do bloqueio.${conflitos.length > 1 ? ` (${conflitos.length} aulas com esse problema)` : ""}` },
        };
      }
      if (b.somenteConferir) return { status: 200, body: { reservasAfetadas: 0, reservas: [] } };
      const [criado] = await tx
        .insert(bloqueiosTable)
        .values({ escolaId, alvoTipo: "recurso", recursoId: recurso.id, quantidade: b.quantidade ?? null, dataInicio: b.dataInicio, dataFim: b.dataFim, turno, numerosAula: aulas, motivo: b.motivo, descricao: b.descricao?.trim() || null, criadoPor: quemBloqueou(req) })
        .returning();
      return { status: 201, body: { id: criado!.id, reservasAfetadas: 0 } };
    });
    res.status(resultado.status).json(resultado.body);
  } catch (err) {
    const codigo = (err as { cause?: { code?: string } })?.cause?.code;
    if (codigo === "42P01") {
      res.status(503).json({ error: "O recurso de bloqueios ainda não foi ativado no banco. Aplique as migrações e tente de novo." });
      return;
    }
    throw err;
  }
});

// remover = liberar: o bloqueio sai de cena (fica o registro de quem bloqueou e por que)
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bloqueio inválido." });
    return;
  }
  const [row] = await db
    .update(bloqueiosTable)
    .set({ ativo: false })
    .where(and(eq(bloqueiosTable.id, id), eq(bloqueiosTable.escolaId, getEscolaId(req)), eq(bloqueiosTable.ativo, true)))
    .returning({ id: bloqueiosTable.id });
  if (!row) {
    res.status(404).json({ error: "Bloqueio não encontrado." });
    return;
  }
  res.json({ ok: true });
});

export default router;
