import { Router } from "express";
import { db } from "@workspace/db";
import { disponibilidadeTable, professoresTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// RF-DISP-01 a RF-DISP-03, RF-PROF-04: CRUD da disponibilidade semanal do
// professor, consumida pelo algoritmo de geração de horário
// (ver routes/horarios.ts) e pela detecção de conflitos
// (ver routes/conflitos.ts, tipo "professor_indisponivel").
//
// Convenção: só é necessário criar um registro para marcar uma EXCEÇÃO
// (disponivel = false). A ausência de registro para um professor/dia/slot
// é tratada como disponível em todo o resto do sistema.
//
// `disponibilidade_professores` não tem coluna própria de escola
// (RNF-SEG-04) — é sempre escopada validando que o `professorId`
// envolvido pertence à escola do usuário autenticado.
//
// [FIX] A identidade de um registro de disponibilidade é
// professorId + diaSemana + horarioSlot + turno — não só os três
// primeiros. horarioSlot é só um número (1, 2, 3...) que SE REPETE entre
// turnos (manhã e noite ambos têm slot 1, 2, 3...), então a query de
// "já existe" precisa incluir turno, senão um bloqueio no turno noturno
// pode sobrescrever silenciosamente um bloqueio já existente no turno
// matutino para o mesmo dia/slot.
const router = Router();

const DisponibilidadeInput = z.object({
  professorId: z.number().int(),
  diaSemana: z.number().int().min(0).max(6),
  horarioSlot: z.number().int().min(0), // [FIX] min(0) -- slot 0 e reservado pra horarios informativos fora do esquema oficial (ex.: 18:00 no noturno)
  disponivel: z.boolean().default(true),
  motivo: z.string().optional(),
  turno: z.enum(["matutino", "vespertino", "noturno"]).optional(),
  horaAtividadeObrigatoria: z.boolean().default(false),
});

// RF-DISP-02: edição em lote — substitui todas as marcações de
// indisponibilidade de um professor por um novo conjunto, numa única
// chamada (evita N requisições para marcar, por exemplo, um dia inteiro).
const DisponibilidadeLoteInput = z.object({
  professorId: z.number().int(),
  itens: z.array(
    z.object({
      diaSemana: z.number().int().min(0).max(6),
      horarioSlot: z.number().int().min(0), // [FIX] min(0) -- slot 0 e reservado pra horarios informativos fora do esquema oficial (ex.: 18:00 no noturno)
      disponivel: z.boolean().default(true),
      motivo: z.string().optional(),
      turno: z.enum(["matutino", "vespertino", "noturno"]).optional(),
      horaAtividadeObrigatoria: z.boolean().default(false),
    }),
  ),
});

// [FIX] Helper para montar a condição de turno de forma segura —
// quando turno é undefined, compara com IS NULL em vez de tentar
// eq(coluna, undefined) (que o Drizzle rejeitaria/ignoraria).
function condicaoTurno(turno: "matutino" | "vespertino" | "noturno" | undefined) {
  return turno ? eq(disponibilidadeTable.turno, turno) : isNull(disponibilidadeTable.turno);
}

// Chave usada tanto pra indexar os registros já existentes quanto pra
// casar cada item recebido com o registro correspondente (ver fix do
// N+1 em POST /lote logo abaixo).
function chaveDisponibilidade(diaSemana: number, horarioSlot: number, turno: string | null | undefined) {
  return `${diaSemana}-${horarioSlot}-${turno ?? "null"}`;
}

async function buscarProfessorDaEscola(professorId: number, escolaId: string) {
  return db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorId = req.query.professorId ? Number(req.query.professorId) : undefined;

  if (professorId) {
    const professor = await buscarProfessorDaEscola(professorId, escolaId);
    if (!professor) {
      res.status(404).json({ error: "Professor não encontrado" });
      return;
    }
    const rows = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId));
    res.json(rows);
    return;
  }

  // Sem professorId: lista a disponibilidade de todos os professores
  // desta escola (nunca de outra).
  const professoresDaEscola = await db.select({ id: professoresTable.id })
    .from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const ids = professoresDaEscola.map(p => p.id);
  const rows = ids.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, ids))
    : [];
  res.json(rows);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DisponibilidadeInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const professor = await buscarProfessorDaEscola(parsed.data.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const existente = await db.select().from(disponibilidadeTable)
    .where(and(
      eq(disponibilidadeTable.professorId, parsed.data.professorId),
      eq(disponibilidadeTable.diaSemana, parsed.data.diaSemana),
      eq(disponibilidadeTable.horarioSlot, parsed.data.horarioSlot),
      condicaoTurno(parsed.data.turno),
    ))
    .then(r => r[0]);

  if (existente) {
    const [atualizado] = await db.update(disponibilidadeTable)
      .set({
        disponivel: parsed.data.disponivel,
        motivo: parsed.data.motivo,
        turno: parsed.data.turno,
        horaAtividadeObrigatoria: parsed.data.horaAtividadeObrigatoria,
      })
      .where(eq(disponibilidadeTable.id, existente.id))
      .returning();
    res.json(atualizado);
    return;
  }

  const [criado] = await db.insert(disponibilidadeTable).values(parsed.data).returning();
  res.status(201).json(criado);
});

// [FIX] N+1 -- antes, pra cada item do lote (até 30 numa semana
// inteira), rodava um SELECT separado pra ver se já existia, e depois
// um INSERT ou UPDATE separado -- até 60 idas ao banco numa chamada só.
// Agora: 1 SELECT busca TODOS os registros existentes desse professor
// de uma vez (já indexado por professor_id); os itens que são criação
// nova viram um ÚNICO INSERT em lote; só os que são atualização de um
// registro já existente continuam individuais (cada um pode ter valores
// diferentes, e não há chave única na tabela pra fazer isso num
// UPSERT só -- mas pelo menos não paga mais o SELECT extra por item).
// Tudo dentro de uma transação, pra não deixar a semana pela metade se
// algo falhar no meio.
router.post("/lote", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DisponibilidadeLoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const professor = await buscarProfessorDaEscola(parsed.data.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const existentes = await db.select().from(disponibilidadeTable)
    .where(eq(disponibilidadeTable.professorId, parsed.data.professorId));
  const existentesPorChave = new Map(
    existentes.map(e => [chaveDisponibilidade(e.diaSemana, e.horarioSlot, e.turno), e]),
  );

  const paraInserir: typeof parsed.data.itens = [];
  const paraAtualizar: Array<{ id: number; item: typeof parsed.data.itens[number] }> = [];
  for (const item of parsed.data.itens) {
    const existente = existentesPorChave.get(chaveDisponibilidade(item.diaSemana, item.horarioSlot, item.turno));
    if (existente) {
      paraAtualizar.push({ id: existente.id, item });
    } else {
      paraInserir.push(item);
    }
  }

  const resultado = await db.transaction(async (tx) => {
    const atualizados = [];
    for (const { id, item } of paraAtualizar) {
      const [atualizado] = await tx.update(disponibilidadeTable)
        .set({
          disponivel: item.disponivel,
          motivo: item.motivo,
          turno: item.turno,
          horaAtividadeObrigatoria: item.horaAtividadeObrigatoria,
        })
        .where(eq(disponibilidadeTable.id, id))
        .returning();
      atualizados.push(atualizado);
    }

    const criados = paraInserir.length
      ? await tx.insert(disponibilidadeTable)
          .values(paraInserir.map(item => ({ professorId: parsed.data.professorId, ...item })))
          .returning()
      : [];

    return [...atualizados, ...criados];
  });

  res.status(201).json(resultado);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const registro = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.id, id)).then(r => r[0]);
  if (!registro) {
    res.status(204).send();
    return;
  }
  const professor = await buscarProfessorDaEscola(registro.professorId, escolaId);
  if (!professor) {
    res.status(404).json({ error: "Registro não encontrado" });
    return;
  }

  await db.delete(disponibilidadeTable).where(eq(disponibilidadeTable.id, id));
  res.status(204).send();
});

export default router;
