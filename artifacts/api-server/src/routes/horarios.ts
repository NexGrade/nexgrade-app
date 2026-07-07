import { Router } from "express";
import { db } from "@workspace/db";
import {
  horariosTable,
  horariosExperimentaisTable,
  disciplinasTable,
  professoresTable,
  turmaDisciplinasTable,
  professorDisciplinasTable,
  turmasTable,
  disponibilidadeTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  CreateHorarioBody,
  DeleteHorarioParams,
  ListHorariosQueryParams,
  GerarHorarioBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

async function enrichSlot(slot: typeof horariosTable.$inferSelect) {
  const [disciplina, professor, turma] = await Promise.all([
    db.select().from(disciplinasTable).where(eq(disciplinasTable.id, slot.disciplinaId)).then(r => r[0]),
    db.select().from(professoresTable).where(eq(professoresTable.id, slot.professorId)).then(r => r[0]),
    db.select().from(turmasTable).where(eq(turmasTable.id, slot.turmaId)).then(r => r[0]),
  ]);
  return { ...slot, disciplina, professor, turma };
}

// ── ALGORITHM ────────────────────────────────────────────────────────────────

export interface GerarOpts {
  escolaId: string;
  turmaId: number;
  aulaspordia: number;
  substituir: boolean;
  reduzirJanelas: boolean;
  fatorPedagogico: boolean;
  experimental: boolean;
  nomeExperimental?: string;
}

export async function gerarAlgoritmo(opts: GerarOpts) {
  const { escolaId, turmaId, aulaspordia, substituir, reduzirJanelas, fatorPedagogico, experimental, nomeExperimental } = opts;
  const useExperimental = experimental && nomeExperimental;

  // RNF-SEG-04: a turma precisa pertencer à escola do usuário autenticado
  // antes de qualquer leitura/escrita — todo o restante da função assume
  // isso para não vazar/alterar dados de outra escola.
  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) throw new Error("Turma não encontrada");

  if (!useExperimental && substituir) {
    await db.delete(horariosTable)
      .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));
  }
  if (useExperimental && substituir) {
    await db.delete(horariosExperimentaisTable)
      .where(and(
        eq(horariosExperimentaisTable.turmaId, turmaId),
        eq(horariosExperimentaisTable.nome, nomeExperimental!),
        eq(horariosExperimentaisTable.escolaId, escolaId),
      ));
  }

  const [turmaDiscs, disciplinas, professores, profDiscs] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, turmaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable)
      .where(and(eq(professoresTable.escolaId, escolaId)))
      .then(rows => rows.filter(p => p.ativo)),
    db.select().from(professorDisciplinasTable),
  ]);

  if (turmaDiscs.length === 0) throw new Error("A turma não tem disciplinas cadastradas");

  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  // RF-ALOC-04 / RF-PROF-04: um professor nunca pode ser alocado num
  // dia/período em que sua disponibilidade esteja marcada como
  // indisponível. A tabela só precisa registrar exceções — a ausência de
  // registro é tratada como disponível (default da coluna `disponivel`).
  // `disponibilidadeTable` não tem coluna própria de escola (é escopada
  // via `professorId`, filtrado acima pela lista de professores da
  // escola atual). `horarioSlot` (disponibilidade) e `numeroAula`
  // (horarios) numeram o mesmo conceito de período dentro do dia.
  const indisponivelProf: Record<string, boolean> = {};
  disponibilidades
    .filter(d => !d.disponivel)
    .forEach(d => {
      indisponivelProf[`${d.professorId}-${d.diaSemana}-${d.horarioSlot}`] = true;
    });

  const conflitos: string[] = [];
  const gerados: typeof horariosTable.$inferSelect[] = [];
  const geradosExp: typeof horariosExperimentaisTable.$inferSelect[] = [];

  const ocupadoProf: Record<string, boolean> = {};
  const ocupadoSlot: Record<string, boolean> = {};

  const existing = useExperimental
    ? await db.select().from(horariosExperimentaisTable)
        .where(and(
          eq(horariosExperimentaisTable.turmaId, turmaId),
          eq(horariosExperimentaisTable.nome, nomeExperimental!),
          eq(horariosExperimentaisTable.escolaId, escolaId),
        ))
    : await db.select().from(horariosTable)
        .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));

  const allSlots = useExperimental
    ? await db.select().from(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId))
    : await db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId));

  existing.forEach(s => {
    ocupadoSlot[`${s.diaSemana}-${s.numeroAula}`] = true;
    ocupadoProf[`${s.professorId}-${s.diaSemana}-${s.numeroAula}`] = true;
  });
  allSlots
    .filter(s => s.turmaId !== turmaId)
    .forEach(s => {
      ocupadoProf[`${s.professorId}-${s.diaSemana}-${s.numeroAula}`] = true;
    });

  const DIAS = [0, 1, 2, 3, 4];

  const diasOrdenados = fatorPedagogico
    ? [1, 3, 2, 4, 0]
    : DIAS;

  const AULAS = Array.from({ length: aulaspordia }, (_, i) => i + 1);

  // RF-TUR-02: a carga horária efetiva de uma disciplina NESTA turma é o
  // override vindo da Matriz Curricular aplicada (ver
  // routes/turmas.ts > POST /:id/aplicar-matriz), com fallback para a
  // carga global de disciplinasTable quando a disciplina foi vinculada
  // manualmente (turma sem matriz aplicada).
  function cargaEfetiva(td: typeof turmaDiscs[number], disc: typeof disciplinas[number] | undefined): number {
    return td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0;
  }

  const discOrdenadas = [...turmaDiscs].sort((a, b) => {
    const da = disciplinas.find(d => d.id === a.disciplinaId);
    const db2 = disciplinas.find(d => d.id === b.disciplinaId);
    return cargaEfetiva(b, db2) - cargaEfetiva(a, da);
  });

  for (const td of discOrdenadas) {
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!disc) continue;

    let alocadas = 0;
    const cargaSemanal = cargaEfetiva(td, disc);

    const profsParaDisc = profDiscs
      .filter(pd => pd.disciplinaId === td.disciplinaId)
      .map(pd => professores.find(p => p.id === pd.professorId))
      .filter(Boolean) as typeof professores;

    if (profsParaDisc.length === 0) {
      conflitos.push(`Sem professor habilitado para "${disc.nome}"`);
      continue;
    }

    const alocacaoPorDia: Record<number, number> = {};

    for (const dia of diasOrdenados) {
      if (alocadas >= cargaSemanal) break;
      const jaNesteDia = alocacaoPorDia[dia] ?? 0;
      if (jaNesteDia >= 2) continue;

      let aulasOrdem = [...AULAS];

      if (reduzirJanelas) {
        const aulasProf: Record<number, number[]> = {};
        profsParaDisc.forEach(p => {
          const aulasNoDia = allSlots
            .filter(s => s.professorId === p.id && s.diaSemana === dia)
            .map(s => s.numeroAula)
            .sort((a, b) => a - b);
          aulasProf[p.id] = aulasNoDia;
        });

        aulasOrdem = AULAS.sort((a, b) => {
          const adjA = profsParaDisc.some(p => {
            const aulas = aulasProf[p.id] ?? [];
            return aulas.includes(a - 1) || aulas.includes(a + 1);
          }) ? 0 : 1;
          const adjB = profsParaDisc.some(p => {
            const aulas = aulasProf[p.id] ?? [];
            return aulas.includes(b - 1) || aulas.includes(b + 1);
          }) ? 0 : 1;
          return adjA - adjB;
        });
      }

      for (const aula of aulasOrdem) {
        if (alocadas >= cargaSemanal) break;
        const slotKey = `${dia}-${aula}`;
        if (ocupadoSlot[slotKey]) continue;

        const profDisponivel = profsParaDisc.find(
          p => !ocupadoProf[`${p.id}-${dia}-${aula}`] && !indisponivelProf[`${p.id}-${dia}-${aula}`],
        );
        if (!profDisponivel) continue;

        if (useExperimental) {
          const [slot] = await db.insert(horariosExperimentaisTable).values({
            escolaId,
            nome: nomeExperimental!,
            turmaId,
            disciplinaId: td.disciplinaId,
            professorId: profDisponivel.id,
            diaSemana: dia,
            numeroAula: aula,
          }).returning();
          geradosExp.push(slot);
        } else {
          const [slot] = await db.insert(horariosTable).values({
            escolaId,
            turmaId,
            disciplinaId: td.disciplinaId,
            professorId: profDisponivel.id,
            diaSemana: dia,
            numeroAula: aula,
          }).returning();
          gerados.push(slot);
        }

        ocupadoSlot[slotKey] = true;
        ocupadoProf[`${profDisponivel.id}-${dia}-${aula}`] = true;
        alocadas++;
        alocacaoPorDia[dia] = jaNesteDia + 1;
        break;
      }
    }

    if (alocadas < cargaSemanal) {
      for (const dia of DIAS) {
        if (alocadas >= cargaSemanal) break;
        for (const aula of AULAS) {
          if (alocadas >= cargaSemanal) break;
          const slotKey = `${dia}-${aula}`;
          if (ocupadoSlot[slotKey]) continue;
          const profDisponivel = profsParaDisc.find(
            p => !ocupadoProf[`${p.id}-${dia}-${aula}`] && !indisponivelProf[`${p.id}-${dia}-${aula}`],
          );
          if (!profDisponivel) continue;

          if (useExperimental) {
            const [slot] = await db.insert(horariosExperimentaisTable).values({
              escolaId,
              nome: nomeExperimental!,
              turmaId,
              disciplinaId: td.disciplinaId,
              professorId: profDisponivel.id,
              diaSemana: dia,
              numeroAula: aula,
            }).returning();
            geradosExp.push(slot);
          } else {
            const [slot] = await db.insert(horariosTable).values({
              escolaId,
              turmaId,
              disciplinaId: td.disciplinaId,
              professorId: profDisponivel.id,
              diaSemana: dia,
              numeroAula: aula,
            }).returning();
            gerados.push(slot);
          }

          ocupadoSlot[slotKey] = true;
          ocupadoProf[`${profDisponivel.id}-${dia}-${aula}`] = true;
          alocadas++;
        }
      }
    }

    if (alocadas < cargaSemanal) {
      conflitos.push(`Apenas ${alocadas}/${cargaSemanal} aulas alocadas para "${disc.nome}"`);
    }
  }

  if (useExperimental) {
    return { slotsGerados: geradosExp.length, conflitos, horario: [] };
  }

  const enriched = await Promise.all(gerados.map(enrichSlot));
  return { slotsGerados: gerados.length, conflitos, horario: enriched };
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

router.post("/gerar", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarHorarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data as {
    turmaId: number;
    aulaspordia?: number;
    substituir?: boolean;
    reduzirJanelas?: boolean;
    fatorPedagogico?: boolean;
    experimental?: boolean;
    nomeExperimental?: string;
  };

  try {
    const result = await gerarAlgoritmo({
      escolaId,
      turmaId: data.turmaId,
      aulaspordia: data.aulaspordia ?? 5,
      substituir: data.substituir ?? false,
      reduzirJanelas: data.reduzirJanelas ?? false,
      fatorPedagogico: data.fatorPedagogico ?? false,
      experimental: data.experimental ?? false,
      nomeExperimental: data.nomeExperimental,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Erro ao gerar horário" });
  }
});

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = ListHorariosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turmaId, professorId } = parsed.data as { turmaId?: number; professorId?: number };

  let slots = await db.select().from(horariosTable)
    .where(eq(horariosTable.escolaId, escolaId))
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);
  if (turmaId) slots = slots.filter(s => s.turmaId === turmaId);
  if (professorId) slots = slots.filter(s => s.professorId === professorId);

  const enriched = await Promise.all(slots.map(enrichSlot));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CreateHorarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data as {
    turmaId: number;
    disciplinaId: number;
    professorId: number;
    diaSemana: number;
    numeroAula: number;
    sala?: string;
  };

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, data.turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }

  const existing = await db.select().from(horariosTable)
    .where(and(
      eq(horariosTable.turmaId, data.turmaId),
      eq(horariosTable.diaSemana, data.diaSemana),
      eq(horariosTable.numeroAula, data.numeroAula),
      eq(horariosTable.escolaId, escolaId),
    ))
    .then(r => r[0]);

  if (existing) {
    res.status(409).json({ error: "Já existe um horário neste slot para esta turma" });
    return;
  }

  const [slot] = await db.insert(horariosTable).values({ ...data, escolaId }).returning();
  const enriched = await enrichSlot(slot);
  res.status(201).json(enriched);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = DeleteHorarioParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  await db.delete(horariosTable)
    .where(and(eq(horariosTable.id, parsed.data.id), eq(horariosTable.escolaId, escolaId)));
  res.status(204).send();
});

// ── EXPERIMENTAIS ─────────────────────────────────────────────────────────────

const ExpInput = z.object({
  nome: z.string().min(1),
  turmaId: z.number().int(),
  disciplinaId: z.number().int(),
  professorId: z.number().int(),
  diaSemana: z.number().int().min(0).max(4),
  numeroAula: z.number().int().min(1).max(8),
  sala: z.string().optional(),
});

router.get("/experimentais", async (req, res) => {
  const escolaId = getEscolaId(req);
  const turmaId = req.query.turmaId ? Number(req.query.turmaId) : undefined;
  let rows = await db.select().from(horariosExperimentaisTable)
    .where(eq(horariosExperimentaisTable.escolaId, escolaId))
    .orderBy(horariosExperimentaisTable.nome, horariosExperimentaisTable.diaSemana, horariosExperimentaisTable.numeroAula);
  if (turmaId) rows = rows.filter(r => r.turmaId === turmaId);
  res.json(rows);
});

router.post("/experimentais", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = ExpInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, parsed.data.turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) {
    res.status(404).json({ error: "Turma não encontrada" });
    return;
  }

  const [slot] = await db.insert(horariosExperimentaisTable).values({ ...parsed.data, escolaId }).returning();
  res.status(201).json(slot);
});

router.post("/experimentais/:nome/promover", async (req, res) => {
  const escolaId = getEscolaId(req);
  const nome = req.params.nome;
  const expSlots = await db.select().from(horariosExperimentaisTable)
    .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));

  if (expSlots.length === 0) {
    res.status(404).json({ error: "Horário experimental não encontrado" });
    return;
  }

  const turmaIds = [...new Set(expSlots.map(s => s.turmaId))];
  for (const turmaId of turmaIds) {
    await db.delete(horariosTable)
      .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));
  }

  const inserted: typeof horariosTable.$inferSelect[] = [];
  for (const s of expSlots) {
    const [slot] = await db.insert(horariosTable).values({
      escolaId,
      turmaId: s.turmaId,
      disciplinaId: s.disciplinaId,
      professorId: s.professorId,
      diaSemana: s.diaSemana,
      numeroAula: s.numeroAula,
      sala: s.sala,
    }).returning();
    inserted.push(slot);
  }

  await db.delete(horariosExperimentaisTable)
    .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));

  res.json({ slotsGerados: inserted.length, conflitos: [], horario: [] });
});

router.delete("/experimentais/:nome", async (req, res) => {
  const escolaId = getEscolaId(req);
  await db.delete(horariosExperimentaisTable)
    .where(and(eq(horariosExperimentaisTable.nome, req.params.nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
  res.status(204).send();
});

export default router;
