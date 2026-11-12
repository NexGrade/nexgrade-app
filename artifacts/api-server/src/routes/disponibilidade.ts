import { Router } from "express";
import { db } from "@workspace/db";
import { disponibilidadeTable, professoresTable, disponibilidadeExperimentalTable } from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { carregarMudancas, comoLinhaDisp, sobrepor, chaveDisp, semTabelaExperimental, type LinhaDisp } from "../lib/disponibilidade-experimento"; // [DISP-EXPERIMENTAL]
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { turnosComAulaPorProfessor, marcarContraturno } from "../lib/ha-contraturno"; // [HA-CONTRATURNO-ASTERISCO]
import { carregarAulasIntegraisNoTurno } from "../lib/turno-integral"; // [DOC-TRAVADA]
import { aulaDOCNoHorario, STATUS_TRAVA_INTEGRAL } from "../lib/trava-integral"; // [DOC-TRAVADA] [TRAVA-INTEGRAL]
import { aulasDoRascunhoEmBloqueioNovo } from "../lib/bloqueio-no-rascunho"; // [AULA-EM-BLOQUEIO]

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

// [DISP-EXPERIMENTAL] (06/11/2026) ?experimento=<nome> nas rotas GET / e POST /lote: le e grava a disponibilidade
// DENTRO do experimento (tabela disponibilidade_experimental), sem mexer na oficial. Ver lib/disponibilidade-experimento.ts.
const AVISO_SEM_TABELA = "A disponibilidade em experimento ainda não está pronta no banco (falta a atualização do sistema). Avise o suporte NexGrade.";
function experimentoDaUrl(q: unknown): string | null {
  return typeof q === "string" && q.trim() ? q.trim().slice(0, 120) : null;
}
/** Estado de um horario, para comparar e mostrar ("Livre", "Bloqueio", "HA", "HA fixa", "Atividade: COORD"). */
export function estadoDisp(r: { disponivel: boolean; horaAtividadeObrigatoria: boolean; motivo?: string | null } | null | undefined): string {
  if (!r || (r.disponivel && !r.horaAtividadeObrigatoria)) return "Livre";
  if (r.horaAtividadeObrigatoria) return (r.motivo ?? "").startsWith("HA fixa") ? "HA fixa" : "HA";
  const atividade = /\(ocupado:\s*([^)]+)\)/.exec(r.motivo ?? "");
  return atividade ? `Atividade: ${atividade[1]!.trim()}` : "Bloqueio";
}

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
  confirmar: z.boolean().optional(), // [AULA-EM-BLOQUEIO] rascunho: grava o bloqueio mesmo com aula do rascunho no horario
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
    const oficial = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId));
    // [DISP-EXPERIMENTAL] dentro de um experimento: a oficial com as mudancas dele por cima (marcadas noExperimento)
    const experimento = experimentoDaUrl(req.query.experimento);
    let rows: Array<LinhaDisp & { noExperimento?: boolean }> = oficial;
    if (experimento) {
      const { linhas, semTabela } = await carregarMudancas(escolaId, experimento);
      if (semTabela) { res.status(503).json({ error: AVISO_SEM_TABELA }); return; }
      rows = sobrepor(oficial, linhas.filter((l) => l.professorId === professorId).map((l) => ({ ...comoLinhaDisp(l), noExperimento: true })));
    }
    // [HA-CONTRATURNO-ASTERISCO] marca HA fora dos turnos de aula (tela mostra "HA*")
    res.json(marcarContraturno(rows, await turnosComAulaPorProfessor(escolaId, [professorId])));
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
  // [HA-CONTRATURNO-ASTERISCO] marca HA fora dos turnos de aula (tela mostra "HA*")
  res.json(marcarContraturno(rows, await turnosComAulaPorProfessor(escolaId, ids)));
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

  // [DOC-TRAVADA] [TRAVA-INTEGRAL] (11/11/2026) esta rota (um horario so) escapava da trava: o horario de aula DOC
  // nao pode ser bloqueado nem receber HA/atividade
  if (!parsed.data.disponivel || parsed.data.horaAtividadeObrigatoria) {
    const doc = await aulaDOCNoHorario(escolaId, parsed.data.professorId, parsed.data.turno, parsed.data.diaSemana, parsed.data.horarioSlot);
    if (doc) {
      res.status(STATUS_TRAVA_INTEGRAL).json({ error: `Nesse horário o professor dá aula na ${doc} (turma integral): ele não pode ser bloqueado nem receber HA.` });
      return;
    }
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

  // [DOC-TRAVADA] (04/11/2026, pedido da dona) horario de aula da turma integral (DOC) nao pode ser bloqueado nem receber HA
  // ou atividade: o que vier para esse horario grava como livre (vale para qualquer tela que chame esta rota)
  const turnosDoLote = [...new Set(parsed.data.itens.map((i) => i.turno).filter((t): t is NonNullable<typeof t> => !!t))];
  const horariosDOC = new Set<string>();
  for (const t of turnosDoLote) {
    for (const a of await carregarAulasIntegraisNoTurno(escolaId, t, [parsed.data.professorId])) horariosDOC.add(`${t}|${a.diaSemana}|${a.numeroAula}`);
  }
  let docLiberados = 0;
  for (const item of parsed.data.itens) {
    if (!item.turno || !horariosDOC.has(`${item.turno}|${item.diaSemana}|${item.horarioSlot}`)) continue;
    if (item.disponivel && !item.horaAtividadeObrigatoria) continue;
    item.disponivel = true; item.horaAtividadeObrigatoria = false; item.motivo = "";
    docLiberados++;
  }
  if (docLiberados) console.log(`[DOC-TRAVADA] professor ${parsed.data.professorId}: ${docLiberados} horario(s) de aula DOC gravados como livres`);

  // [DISP-EXPERIMENTAL] grava no experimento. Horario que volta a ficar igual a oficial sai do experimento.
  const experimento = experimentoDaUrl(req.query.experimento);
  if (experimento) {
    if (parsed.data.itens.some((i) => !i.turno)) { res.status(400).json({ error: "Escolha o turno para editar a disponibilidade do experimento." }); return; }
    const professorId = parsed.data.professorId;
    // [AULA-EM-BLOQUEIO] (12/11/2026) bloqueio novo onde o rascunho ja tem aula do professor: antes gravava calado e o
    // Promover levava a aula para cima do bloqueio. Sem confirmar, nada grava e a tela mostra as aulas.
    if (!parsed.data.confirmar) {
      const aulas = await aulasDoRascunhoEmBloqueioNovo(escolaId, experimento, professorId, parsed.data.itens);
      if (aulas.length) {
        res.status(409).json({
          error: `${professor.nome} tem aula no rascunho nesse(s) horário(s): ${aulas.join("; ")}. A aula fica onde está até mudar de lugar, e o rascunho não pode ser promovido assim.`,
          aulasNoHorario: aulas, precisaConfirmar: true,
        });
        return;
      }
    }
    const oficial = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId));
    const oficialPorChave = new Map(oficial.map((o) => [chaveDisp(o), o]));
    try {
      await db.transaction(async (tx) => {
        for (const item of parsed.data.itens) {
          const chave = { professorId, diaSemana: item.diaSemana, horarioSlot: item.horarioSlot, turno: item.turno! };
          const o = oficialPorChave.get(chaveDisp(chave));
          const igual = estadoDisp(o) === estadoDisp(item) && (estadoDisp(item) === "Livre" || (o?.motivo ?? "") === (item.motivo ?? ""));
          const onde = and(
            eq(disponibilidadeExperimentalTable.escolaId, escolaId), eq(disponibilidadeExperimentalTable.nome, experimento),
            eq(disponibilidadeExperimentalTable.professorId, professorId), eq(disponibilidadeExperimentalTable.diaSemana, item.diaSemana),
            eq(disponibilidadeExperimentalTable.horarioSlot, item.horarioSlot), eq(disponibilidadeExperimentalTable.turno, item.turno!),
          );
          if (igual) { await tx.delete(disponibilidadeExperimentalTable).where(onde); continue; }
          const valores = { disponivel: item.disponivel, motivo: item.motivo ?? null, horaAtividadeObrigatoria: item.horaAtividadeObrigatoria };
          await tx.insert(disponibilidadeExperimentalTable)
            .values({ escolaId, nome: experimento, ...chave, ...valores, criadoPor: null })
            .onConflictDoUpdate({
              target: [disponibilidadeExperimentalTable.escolaId, disponibilidadeExperimentalTable.nome, disponibilidadeExperimentalTable.professorId,
                disponibilidadeExperimentalTable.diaSemana, disponibilidadeExperimentalTable.horarioSlot, disponibilidadeExperimentalTable.turno],
              set: { ...valores, atualizadoEm: new Date() },
            });
        }
      });
    } catch (e) {
      if (semTabelaExperimental(e)) { res.status(503).json({ error: AVISO_SEM_TABELA }); return; }
      throw e;
    }
    const { linhas } = await carregarMudancas(escolaId, experimento);
    res.status(201).json(linhas.filter((l) => l.professorId === professorId).map((l) => ({ ...comoLinhaDisp(l), noExperimento: true })));
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

// [DISP-EXPERIMENTAL] experimentos com disponibilidade da escola: nome, quantas mudancas e de quantos professores
router.get("/experimentos", async (req, res) => {
  const escolaId = getEscolaId(req);
  try {
    const rows = await db.select({
      nome: disponibilidadeExperimentalTable.nome,
      mudancas: sql<number>`count(*)::int`,
      professores: sql<number>`count(distinct ${disponibilidadeExperimentalTable.professorId})::int`,
    }).from(disponibilidadeExperimentalTable).where(eq(disponibilidadeExperimentalTable.escolaId, escolaId))
      .groupBy(disponibilidadeExperimentalTable.nome).orderBy(disponibilidadeExperimentalTable.nome);
    res.json({ semTabela: false, experimentos: rows });
  } catch (e) {
    if (semTabelaExperimental(e)) { res.json({ semTabela: true, experimentos: [] }); return; }
    throw e;
  }
});

// [DISP-EXPERIMENTAL] o que o experimento muda na disponibilidade, horario a horario (antes = oficial de hoje)
router.get("/experimentos/:nome", async (req, res) => {
  const escolaId = getEscolaId(req);
  const { linhas, semTabela } = await carregarMudancas(escolaId, req.params.nome);
  if (semTabela) { res.status(503).json({ error: AVISO_SEM_TABELA }); return; }
  const profIds = [...new Set(linhas.map((l) => l.professorId))];
  const [profs, oficial] = profIds.length
    ? await Promise.all([
        db.select({ id: professoresTable.id, nome: professoresTable.nome }).from(professoresTable).where(and(inArray(professoresTable.id, profIds), eq(professoresTable.escolaId, escolaId))),
        db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds)),
      ])
    : [[], []];
  const nomes = new Map(profs.map((p) => [p.id, p.nome]));
  const oficialPorChave = new Map(oficial.map((o) => [chaveDisp(o), o]));
  const ordemTurno: Record<string, number> = { matutino: 0, vespertino: 1, noturno: 2 };
  const mudancas = linhas.filter((l) => nomes.has(l.professorId)).map((l) => ({
    professorId: l.professorId, professor: nomes.get(l.professorId)!, turno: l.turno, diaSemana: l.diaSemana, horarioSlot: l.horarioSlot,
    antes: estadoDisp(oficialPorChave.get(chaveDisp(l))), depois: estadoDisp(l),
  })).sort((a, b) => a.professor.localeCompare(b.professor, "pt-BR") || (ordemTurno[a.turno] ?? 9) - (ordemTurno[b.turno] ?? 9) || a.diaSemana - b.diaSemana || a.horarioSlot - b.horarioSlot);
  res.json({ nome: req.params.nome, mudancas });
});

// [DISP-EXPERIMENTAL] desfaz as mudancas de um professor no experimento (volta a valer a oficial)
router.delete("/experimentos/:nome/professores/:professorId", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorId = Number(req.params.professorId);
  if (!Number.isInteger(professorId)) { res.status(400).json({ error: "Professor inválido" }); return; }
  try {
    const r = await db.delete(disponibilidadeExperimentalTable).where(and(
      eq(disponibilidadeExperimentalTable.escolaId, escolaId), eq(disponibilidadeExperimentalTable.nome, req.params.nome),
      eq(disponibilidadeExperimentalTable.professorId, professorId),
    )).returning({ id: disponibilidadeExperimentalTable.id });
    res.json({ apagadas: r.length });
  } catch (e) {
    if (semTabelaExperimental(e)) { res.status(503).json({ error: AVISO_SEM_TABELA }); return; }
    throw e;
  }
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
