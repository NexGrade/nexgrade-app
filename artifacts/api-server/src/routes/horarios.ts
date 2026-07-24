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
  limitesDiariosProfessorTable,
  configuracoesTable,
  horarioSlotsTable,
} from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
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

// ── ALGORITHM ────────────────────────────────────────────────────────

export interface GerarOpts {
  escolaId: string;
  turmaId: number;
  aulaspordia?: number;
  substituir: boolean;
  reduzirJanelas: boolean;
  fatorPedagogico: boolean;
  compactarCargaHoraria?: boolean;
  experimental: boolean;
  nomeExperimental?: string;
}

const CHAVE_MAX_GEMINADAS_PADRAO = "seed_pr.max_aulas_geminadas_padrao";
const DEFAULT_MAX_GEMINADAS = 2;
const CHAVE_MAX_COMPLEMENTAR_PADRAO = "seed_pr.max_aulas_complementar_padrao";

export async function gerarAlgoritmo(opts: GerarOpts) {
  const {
    escolaId, turmaId, substituir, reduzirJanelas,
    fatorPedagogico, compactarCargaHoraria = false, experimental, nomeExperimental,
  } = opts;
  const useExperimental = experimental && nomeExperimental;

  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) throw new Error("Turma não encontrada");

  if (turma.turno === "matutino" && !turma.nivelEnsino) {
    throw new Error(
      "Esta turma não tem o nível de ensino definido (Fundamental ou Médio/Técnico), necessário para saber se o " +
      "esquema matutino tem 5 ou 6 aulas por dia. Defina o nível de ensino da turma antes de gerar o horário.",
    );
  }
  const condicaoNivel = turma.turno === "matutino"
    ? eq(horarioSlotsTable.nivelEnsino, turma.nivelEnsino!)
    : isNull(horarioSlotsTable.nivelEnsino);
  const slotsDoTurno = await db.select().from(horarioSlotsTable)
    .where(and(eq(horarioSlotsTable.turno, turma.turno), condicaoNivel));
  if (slotsDoTurno.length === 0) {
    throw new Error(
      `Nenhum esquema de horário configurado para o turno "${turma.turno}"` +
      (turma.turno === "matutino" ? ` (nível: ${turma.nivelEnsino})` : "") +
      ". Configure o esquema de horários antes de gerar.",
    );
  }
  const aulasPorDiaReal = slotsDoTurno.length;

  const [turmaDiscs, disciplinas, professores, profDiscs, configGeminadas, configComplementarPadrao, limitesProfessor] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, turmaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable)
      .where(and(eq(professoresTable.escolaId, escolaId)))
      .then(rows => rows.filter(p => p.ativo)),
    db.select().from(professorDisciplinasTable),
    db.select().from(configuracoesTable)
      .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_GEMINADAS_PADRAO)))
      .then(r => r[0]),
    db.select().from(configuracoesTable)
      .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_COMPLEMENTAR_PADRAO)))
      .then(r => r[0]),
    db.select().from(limitesDiariosProfessorTable).where(eq(limitesDiariosProfessorTable.escolaId, escolaId)),
  ]);

  if (turmaDiscs.length === 0) throw new Error("A turma não tem disciplinas cadastradas");

  const maxGeminadasPadrao = typeof configGeminadas?.valor === "number"
    ? configGeminadas.valor
    : DEFAULT_MAX_GEMINADAS;

  const maxComplementarPadrao = typeof configComplementarPadrao?.valor === "number"
    ? configComplementarPadrao.valor
    : undefined;

  function limiteDiarioProfessor(professorId: number): number {
    const especifico = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === turmaId);
    if (especifico) return especifico.maxAulasPorDia;
    const padrao = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === null);
    if (padrao) return padrao.maxAulasPorDia;
    if (maxComplementarPadrao !== undefined) return maxComplementarPadrao;
    return Infinity;
  }

  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  const indisponivelProf: Record<string, boolean> = {};
  disponibilidades
    .filter(d => !d.disponivel)
    .forEach(d => {
      indisponivelProf[`${d.professorId}-${d.diaSemana}-${d.horarioSlot}`] = true;
    });

  const conflitos: string[] = [];
  const slotsParaGravar: Array<{
    disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number;
  }> = [];

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

  const existingIds = new Set(existing.map(s => s.id));
  const baseSlots = substituir ? allSlots.filter(s => !existingIds.has(s.id)) : allSlots;

  if (!substituir) {
    existing.forEach(s => {
      ocupadoSlot[`${s.diaSemana}-${s.numeroAula}`] = true;
      ocupadoProf[`${s.professorId}-${s.diaSemana}-${s.numeroAula}`] = true;
    });
  }
  baseSlots
    .filter(s => s.turmaId !== turmaId)
    .forEach(s => {
      ocupadoProf[`${s.professorId}-${s.diaSemana}-${s.numeroAula}`] = true;
    });

  const aulasPorProfessorDia: Record<number, number[]> = {};
  baseSlots.forEach(s => {
    if (!aulasPorProfessorDia[s.professorId]) aulasPorProfessorDia[s.professorId] = [];
    aulasPorProfessorDia[s.professorId].push(s.diaSemana * 100 + s.numeroAula);
  });

  const aulasProfessorNaTurmaPorDia: Record<string, number> = {};
  const slotsProfessorNaTurmaPorDia: Record<string, Set<number>> = {};
  if (!substituir) {
    existing.forEach(s => {
      const key = `${s.professorId}-${s.diaSemana}`;
      aulasProfessorNaTurmaPorDia[key] = (aulasProfessorNaTurmaPorDia[key] ?? 0) + 1;
      if (!slotsProfessorNaTurmaPorDia[key]) slotsProfessorNaTurmaPorDia[key] = new Set();
      slotsProfessorNaTurmaPorDia[key].add(s.numeroAula);
    });
  }

  const diasUsadosPorProfessor: Record<number, Set<number>> = {};
  baseSlots.forEach(s => {
    if (!diasUsadosPorProfessor[s.professorId]) diasUsadosPorProfessor[s.professorId] = new Set();
    diasUsadosPorProfessor[s.professorId].add(s.diaSemana);
  });

  const DIAS = [0, 1, 2, 3, 4];
  const diasBase = fatorPedagogico ? [1, 3, 2, 4, 0] : DIAS;
  const AULAS = Array.from({ length: aulasPorDiaReal }, (_, i) => i + 1);

  function cargaEfetiva(td: typeof turmaDiscs[number], disc: typeof disciplinas[number] | undefined): number {
    return td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0;
  }

  function maxGeminadasEfetivo(td: typeof turmaDiscs[number]): number {
    return td.maxAulasConsecutivasDia ?? maxGeminadasPadrao;
  }

  const discOrdenadas = [...turmaDiscs].sort((a, b) => {
    const da = disciplinas.find(d => d.id === a.disciplinaId);
    const db2 = disciplinas.find(d => d.id === b.disciplinaId);
    return cargaEfetiva(b, db2) - cargaEfetiva(a, da);
  });

  function alocar(disciplinaId: number, professorId: number, dia: number, aula: number) {
    slotsParaGravar.push({ disciplinaId, professorId, diaSemana: dia, numeroAula: aula });
    ocupadoSlot[`${dia}-${aula}`] = true;
    ocupadoProf[`${professorId}-${dia}-${aula}`] = true;

    if (!aulasPorProfessorDia[professorId]) aulasPorProfessorDia[professorId] = [];
    aulasPorProfessorDia[professorId].push(dia * 100 + aula);

    const keyTurmaDia = `${professorId}-${dia}`;
    aulasProfessorNaTurmaPorDia[keyTurmaDia] = (aulasProfessorNaTurmaPorDia[keyTurmaDia] ?? 0) + 1;
    if (!slotsProfessorNaTurmaPorDia[keyTurmaDia]) slotsProfessorNaTurmaPorDia[keyTurmaDia] = new Set();
    slotsProfessorNaTurmaPorDia[keyTurmaDia].add(aula);

    if (!diasUsadosPorProfessor[professorId]) diasUsadosPorProfessor[professorId] = new Set();
    diasUsadosPorProfessor[professorId].add(dia);
  }

  function semAulaAdjacenteMesmaTurma(professorId: number, dia: number, aula: number): boolean {
    const slots = slotsProfessorNaTurmaPorDia[`${professorId}-${dia}`];
    if (!slots) return true;
    return !slots.has(aula - 1) && !slots.has(aula + 1);
  }

  function respeitaLimiteComplementar(professorId: number, dia: number): boolean {
    const limite = limiteDiarioProfessor(professorId);
    if (limite === Infinity) return true;
    const atual = aulasProfessorNaTurmaPorDia[`${professorId}-${dia}`] ?? 0;
    return atual < limite;
  }

  for (const td of discOrdenadas) {
    const disc = disciplinas.find(d => d.id === td.disciplinaId);
    if (!disc) continue;

    let alocadas = 0;
    const cargaSemanal = cargaEfetiva(td, disc);
    const maxGeminadas = maxGeminadasEfetivo(td);

    const profsParaDisc = td.professorId
      ? professores.filter(p => p.id === td.professorId)
      : profDiscs
          .filter(pd => pd.disciplinaId === td.disciplinaId)
          .map(pd => professores.find(p => p.id === pd.professorId))
          .filter(Boolean) as typeof professores;

    if (profsParaDisc.length === 0) {
      conflitos.push(`Sem professor habilitado para "${disc.nome}"`);
      continue;
    }

    const alocacaoPorDia: Record<number, number> = {};

    let diasOrdenados = diasBase;
    if (compactarCargaHoraria) {
      diasOrdenados = [...diasBase].sort((a, b) => {
        const usaA = profsParaDisc.some(p => diasUsadosPorProfessor[p.id]?.has(a)) ? 0 : 1;
        const usaB = profsParaDisc.some(p => diasUsadosPorProfessor[p.id]?.has(b)) ? 0 : 1;
        return usaA - usaB;
      });
    }

    for (const dia of diasOrdenados) {
      if (alocadas >= cargaSemanal) break;
      const jaNesteDia = alocacaoPorDia[dia] ?? 0;
      if (jaNesteDia >= maxGeminadas) continue;

      let aulasOrdem = [...AULAS];

      if (reduzirJanelas) {
        aulasOrdem = AULAS.sort((a, b) => {
          const adjA = profsParaDisc.some(p => {
            const aulas = aulasPorProfessorDia[p.id] ?? [];
            return aulas.includes(dia * 100 + (a - 1)) || aulas.includes(dia * 100 + (a + 1));
          }) ? 0 : 1;
          const adjB = profsParaDisc.some(p => {
            const aulas = aulasPorProfessorDia[p.id] ?? [];
            return aulas.includes(dia * 100 + (b - 1)) || aulas.includes(dia * 100 + (b + 1));
          }) ? 0 : 1;
          return adjA - adjB;
        });
      }

      for (const aula of aulasOrdem) {
        if (alocadas >= cargaSemanal) break;
        const slotKey = `${dia}-${aula}`;
        if (ocupadoSlot[slotKey]) continue;

        const profDisponivel = profsParaDisc.find(
          p => !ocupadoProf[`${p.id}-${dia}-${aula}`]
            && !indisponivelProf[`${p.id}-${dia}-${aula}`]
            && respeitaLimiteComplementar(p.id, dia)
            && semAulaAdjacenteMesmaTurma(p.id, dia, aula),
        );
        if (!profDisponivel) continue;

        alocar(td.disciplinaId, profDisponivel.id, dia, aula);
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
            p => !ocupadoProf[`${p.id}-${dia}-${aula}`]
              && !indisponivelProf[`${p.id}-${dia}-${aula}`]
              && respeitaLimiteComplementar(p.id, dia)
              && semAulaAdjacenteMesmaTurma(p.id, dia, aula),
          );
          if (!profDisponivel) continue;

          alocar(td.disciplinaId, profDisponivel.id, dia, aula);
          alocadas++;
        }
      }
    }

    if (alocadas < cargaSemanal) {
      conflitos.push(`Apenas ${alocadas}/${cargaSemanal} aulas alocadas para "${disc.nome}"`);
    }
  }

  const gravados = await db.transaction(async (tx) => {
    if (useExperimental) {
      if (substituir) {
        await tx.delete(horariosExperimentaisTable)
          .where(and(
            eq(horariosExperimentaisTable.turmaId, turmaId),
            eq(horariosExperimentaisTable.nome, nomeExperimental!),
            eq(horariosExperimentaisTable.escolaId, escolaId),
          ));
      }
      if (slotsParaGravar.length === 0) return [];
      const linhas = slotsParaGravar.map(s => ({ escolaId, nome: nomeExperimental!, turmaId, ...s }));
      return tx.insert(horariosExperimentaisTable).values(linhas).returning();
    }

    if (substituir) {
      await tx.delete(horariosTable)
        .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));
    }
    if (slotsParaGravar.length === 0) return [];
    const linhas = slotsParaGravar.map(s => ({ escolaId, turmaId, ...s }));
    return tx.insert(horariosTable).values(linhas).returning();
  });

  if (useExperimental) {
    return { slotsGerados: gravados.length, conflitos, horario: [] };
  }

  const enriched = await Promise.all((gravados as typeof horariosTable.$inferSelect[]).map(enrichSlot));
  return { slotsGerados: gravados.length, conflitos, horario: enriched };
}

// ── ROUTES ───────────────────────────────────────────────────────────

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
    compactarCargaHoraria?: boolean;
    experimental?: boolean;
    nomeExperimental?: string;
  };

  try {
    const result = await gerarAlgoritmo({
      escolaId,
      turmaId: data.turmaId,
      aulaspordia: data.aulaspordia,
      substituir: data.substituir ?? false,
      reduzirJanelas: data.reduzirJanelas ?? false,
      fatorPedagogico: data.fatorPedagogico ?? false,
      compactarCargaHoraria: data.compactarCargaHoraria ?? false,
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

  const condicoes = [eq(horariosTable.escolaId, escolaId)];
  if (turmaId) condicoes.push(eq(horariosTable.turmaId, turmaId));
  if (professorId) condicoes.push(eq(horariosTable.professorId, professorId));

  const slots = await db.select().from(horariosTable)
    .where(and(...condicoes))
    .orderBy(horariosTable.diaSemana, horariosTable.numeroAula);

  if (slots.length === 0) {
    res.json([]);
    return;
  }

  const disciplinaIds = [...new Set(slots.map(s => s.disciplinaId))];
  const professorIds = [...new Set(slots.map(s => s.professorId))];
  const turmaIds = [...new Set(slots.map(s => s.turmaId))];

  const [disciplinas, professores, turmas] = await Promise.all([
    db.select().from(disciplinasTable).where(inArray(disciplinasTable.id, disciplinaIds)),
    db.select().from(professoresTable).where(inArray(professoresTable.id, professorIds)),
    db.select().from(turmasTable).where(inArray(turmasTable.id, turmaIds)),
  ]);
  const discMap = new Map(disciplinas.map(d => [d.id, d]));
  const profMap = new Map(professores.map(p => [p.id, p]));
  const turmaMap = new Map(turmas.map(t => [t.id, t]));

  const enriched = slots.map(s => ({
    ...s,
    disciplina: discMap.get(s.disciplinaId),
    professor: profMap.get(s.professorId),
    turma: turmaMap.get(s.turmaId),
  }));
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

// ── EXPERIMENTAIS ────────────────────────────────────────────────────

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

  const linhas = expSlots.map((s) => ({
    escolaId,
    turmaId: s.turmaId,
    disciplinaId: s.disciplinaId,
    professorId: s.professorId,
    diaSemana: s.diaSemana,
    numeroAula: s.numeroAula,
    sala: s.sala,
  }));

  const inserted = await db.transaction(async (tx) => {
    for (const turmaId of turmaIds) {
      await tx.delete(horariosTable)
        .where(and(eq(horariosTable.turmaId, turmaId), eq(horariosTable.escolaId, escolaId)));
    }
    const gravados = await tx.insert(horariosTable).values(linhas).returning();
    await tx.delete(horariosExperimentaisTable)
      .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
    return gravados;
  });

  res.json({ slotsGerados: inserted.length, conflitos: [], horario: [] });
});

router.delete("/experimentais/:nome", async (req, res) => {
  const escolaId = getEscolaId(req);
  await db.delete(horariosExperimentaisTable)
    .where(and(eq(horariosExperimentaisTable.nome, req.params.nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
  res.status(204).send();
});

// ── GERAÇÃO EM MASSA ─────────────────────────────────────────────────

const GerarLoteBody = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]).optional(),
  nomeExperimental: z.string().min(1),
  reduzirJanelas: z.boolean().optional(),
  fatorPedagogico: z.boolean().optional(),
  compactarCargaHoraria: z.boolean().optional(),
});

router.post("/gerar-lote", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarLoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turno, nomeExperimental, reduzirJanelas, fatorPedagogico, compactarCargaHoraria } = parsed.data;

  let turmasAlvo = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  if (turno) turmasAlvo = turmasAlvo.filter(t => t.turno === turno);

  if (turmasAlvo.length === 0) {
    res.status(400).json({ error: turno ? `Nenhuma turma encontrada no turno "${turno}"` : "Nenhuma turma cadastrada" });
    return;
  }

  await db.delete(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId));

  const resultados: Array<{ turmaId: number; turmaNome: string; slotsGerados: number; conflitos: string[]; erro?: string }> = [];
  for (const turma of turmasAlvo) {
    try {
      const r = await gerarAlgoritmo({
        escolaId,
        turmaId: turma.id,
        substituir: true,
        reduzirJanelas: reduzirJanelas ?? true,
        fatorPedagogico: fatorPedagogico ?? false,
        compactarCargaHoraria: compactarCargaHoraria ?? false,
        experimental: true,
        nomeExperimental,
      });
      resultados.push({ turmaId: turma.id, turmaNome: turma.nome, slotsGerados: r.slotsGerados, conflitos: r.conflitos });
    } catch (err) {
      resultados.push({
        turmaId: turma.id, turmaNome: turma.nome, slotsGerados: 0, conflitos: [],
        erro: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  const totalSlots = resultados.reduce((s, r) => s + r.slotsGerados, 0);
  const totalConflitos = resultados.reduce((s, r) => s + r.conflitos.length, 0);
  const turmasComErro = resultados.filter(r => r.erro);

  res.json({
    nomeExperimental,
    totalTurmas: turmasAlvo.length,
    totalSlots,
    totalConflitos,
    turmasComErro: turmasComErro.length,
    resultados,
  });
});

const GerarProfessorBody = z.object({
  professorId: z.number().int(),
  reduzirJanelas: z.boolean().optional(),
  fatorPedagogico: z.boolean().optional(),
  compactarCargaHoraria: z.boolean().optional(),
});

router.post("/gerar-professor", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { professorId, reduzirJanelas, fatorPedagogico, compactarCargaHoraria } = parsed.data;

  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const [slotsAtuais, vinculos, turmasDaEscola] = await Promise.all([
    db.select({ turmaId: horariosTable.turmaId }).from(horariosTable)
      .where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.professorId, professorId))),
    db.select({ turmaId: turmaDisciplinasTable.turmaId }).from(turmaDisciplinasTable)
      .where(eq(turmaDisciplinasTable.professorId, professorId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);

  const turmaIdsValidosDaEscola = new Set(turmasDaEscola.map((t) => t.id));
  const turmaIds = [...new Set([...slotsAtuais.map((s) => s.turmaId), ...vinculos.map((v) => v.turmaId)])]
    .filter((id) => turmaIdsValidosDaEscola.has(id));

  if (turmaIds.length === 0) {
    res.status(400).json({ error: "Este professor não está vinculado a nenhuma turma (nem por aula já alocada, nem por disciplina cadastrada)" });
    return;
  }

  const nomeExperimental = `Regen-${professor.nome.split(" ")[0]}-${new Date().toISOString().split("T")[0]}`;

  const resultados: Array<{ turmaId: number; turmaNome: string; slotsGerados: number; conflitos: string[]; erro?: string }> = [];
  for (const turmaId of turmaIds) {
    const turma = turmasDaEscola.find((t) => t.id === turmaId);
    try {
      const r = await gerarAlgoritmo({
        escolaId,
        turmaId,
        substituir: true,
        reduzirJanelas: reduzirJanelas ?? true,
        fatorPedagogico: fatorPedagogico ?? false,
        compactarCargaHoraria: compactarCargaHoraria ?? false,
        experimental: true,
        nomeExperimental,
      });
      resultados.push({ turmaId, turmaNome: turma?.nome ?? String(turmaId), slotsGerados: r.slotsGerados, conflitos: r.conflitos });
    } catch (err) {
      resultados.push({
        turmaId, turmaNome: turma?.nome ?? String(turmaId), slotsGerados: 0, conflitos: [],
        erro: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  res.json({
    professorId,
    professorNome: professor.nome,
    nomeExperimental,
    totalTurmas: turmaIds.length,
    resultados,
  });
});

const CorrigirProfessorBody = z.object({
  professorId: z.number().int(),
});

router.post("/corrigir-professor", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = CorrigirProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { professorId } = parsed.data;

  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then((r) => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const [todosSlotsDaEscola, disponibilidades, turmasDaEscola, horarioSlotsTodos] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, professorId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);

  const turnoPorTurmaId = new Map(turmasDaEscola.map((t) => [t.id, t.turno]));
  const slotsDoProf = todosSlotsDaEscola.filter((s) => s.professorId === professorId);

  const indisponivelSet = new Set(
    disponibilidades.filter((d) => !d.disponivel).map((d) => `${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`),
  );

  const conflitantes = slotsDoProf.filter((s) => {
    const turno = turnoPorTurmaId.get(s.turmaId) ?? "desconhecido";
    return indisponivelSet.has(`${turno}-${s.diaSemana}-${s.numeroAula}`);
  });

  if (conflitantes.length === 0) {
    res.json({
      professorId, professorNome: professor.nome, movidas: [], naoResolvidas: [],
      mensagem: "Nenhuma aula deste professor está em conflito com a disponibilidade atual — nada pra corrigir.",
    });
    return;
  }

  const movidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; de: { dia: number; aula: number }; para: { dia: number; aula: number } }> = [];
  const naoResolvidas: Array<{ turmaId: number; turmaNome: string; disciplinaId: number; dia: number; aula: number; motivo: string }> = [];

  const ocupadoProfAtual = new Set(
    todosSlotsDaEscola.map((s) => `${s.professorId}-${turnoPorTurmaId.get(s.turmaId) ?? "desconhecido"}-${s.diaSemana}-${s.numeroAula}`),
  );
  const ocupadoTurmaAtual = new Set(todosSlotsDaEscola.map((s) => `${s.turmaId}-${s.diaSemana}-${s.numeroAula}`));

  const DIAS = [0, 1, 2, 3, 4];

  for (const slot of conflitantes) {
    const turma = turmasDaEscola.find((t) => t.id === slot.turmaId);
    const turno = turnoPorTurmaId.get(slot.turmaId) ?? "desconhecido";
    const nivel = turma?.nivelEnsino ?? null;
    const aulasDoTurno = horarioSlotsTodos
      .filter((hs) => hs.turno === turno && (turno !== "matutino" || hs.nivelEnsino === nivel))
      .map((hs) => hs.numeroAula)
      .filter((n) => n >= 1);

    let destino: { dia: number; aula: number } | null = null;
    for (const dia of DIAS) {
      for (const aula of aulasDoTurno) {
        if (dia === slot.diaSemana && aula === slot.numeroAula) continue;
        const chaveProf = `${professorId}-${turno}-${dia}-${aula}`;
        const chaveTurma = `${slot.turmaId}-${dia}-${aula}`;
        if (ocupadoProfAtual.has(chaveProf)) continue;
        if (ocupadoTurmaAtual.has(chaveTurma)) continue;
        if (indisponivelSet.has(`${turno}-${dia}-${aula}`)) continue;
        destino = { dia, aula };
        break;
      }
      if (destino) break;
    }

    if (!destino) {
      naoResolvidas.push({
        turmaId: slot.turmaId, turmaNome: turma?.nome ?? String(slot.turmaId),
        disciplinaId: slot.disciplinaId, dia: slot.diaSemana, aula: slot.numeroAula,
        motivo: "Não encontrei nenhum horário livre nessa turma, na semana toda, em que o professor esteja disponível.",
      });
      continue;
    }

    await db.update(horariosTable)
      .set({ diaSemana: destino.dia, numeroAula: destino.aula })
      .where(eq(horariosTable.id, slot.id));

    ocupadoProfAtual.delete(`${professorId}-${turno}-${slot.diaSemana}-${slot.numeroAula}`);
    ocupadoProfAtual.add(`${professorId}-${turno}-${destino.dia}-${destino.aula}`);
    ocupadoTurmaAtual.delete(`${slot.turmaId}-${slot.diaSemana}-${slot.numeroAula}`);
    ocupadoTurmaAtual.add(`${slot.turmaId}-${destino.dia}-${destino.aula}`);

    movidas.push({
      turmaId: slot.turmaId, turmaNome: turma?.nome ?? String(slot.turmaId),
      disciplinaId: slot.disciplinaId, de: { dia: slot.diaSemana, aula: slot.numeroAula }, para: destino,
    });
  }

  res.json({ professorId, professorNome: professor.nome, movidas, naoResolvidas });
});

// ── GERAÇÃO COM CP-SAT (OR-Tools) ───────────────────────────────────
//
// Chama o microserviço Python (cpsat-service/, deployado como Web
// Service separado no Render) que resolve a grade com o solver CP-SAT
// em vez do heurístico acima. Validado com dados reais dos 3 turnos
// antes desta integração (ver spike-cp-sat/) -- todos OPTIMAL em
// menos de 1s.
//
// Sempre grava como EXPERIMENTO (nunca direto na grade oficial), pelo
// mesmo motivo documentado em /gerar-professor: é motor novo, ainda
// não testado em produção com a escola real, então qualquer resultado
// precisa passar por revisão humana antes de virar oficial (via
// /experimentais/:nome/promover, que já existe).
//
// Limitação assumida aqui (mesma do script de export que gerou os
// dados de validação): usa TODOS os slots de horário do turno sem
// diferenciar por nível de ensino -- se o matutino tiver turmas de
// Fundamental E Médio com esquemas de aula diferentes ao mesmo tempo,
// isso pode precisar de ajuste antes de usar em produção real.

const CPSAT_SERVICE_URL = process.env.CPSAT_SERVICE_URL || "https://nexgrade-cpsat.onrender.com";

const GerarCpsatBody = z.object({
  turno: z.enum(["matutino", "vespertino", "noturno"]),
  nomeExperimental: z.string().min(1),
  tempoLimiteS: z.number().int().positive().optional(),
});

router.post("/gerar-cpsat", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = GerarCpsatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { turno, nomeExperimental, tempoLimiteS } = parsed.data;

  const turmasDoTurno = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.turno, turno)));
  if (turmasDoTurno.length === 0) {
    res.status(400).json({ error: `Nenhuma turma encontrada no turno "${turno}"` });
    return;
  }
  const turmaIds = turmasDoTurno.map((t) => t.id);

  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlotsTurno] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
    db.select().from(horarioSlotsTable).where(and(eq(horarioSlotsTable.escolaId, escolaId), eq(horarioSlotsTable.turno, turno))),
  ]);

  if (turmaDiscsTodos.length === 0) {
    res.status(400).json({ error: "Nenhuma disciplina cadastrada para as turmas deste turno" });
    return;
  }

  const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));
  const professorMap = new Map(professoresTodos.map((p) => [p.id, p]));
  const turmaMap = new Map(turmasDoTurno.map((t) => [t.id, t]));

  // Chave usada pra mapear a resposta do CP-SAT (que só devolve nomes,
  // não IDs) de volta pros IDs reais do banco. Mesma convenção usada
  // em scripts/exportar-dados-cpsat.ts, já validada com dados reais.
  const chaveParaIds = new Map<string, { turmaId: number; disciplinaId: number }>();
  const nomeParaProfessorId = new Map<string, number>();
  professoresTodos.forEach((p) => nomeParaProfessorId.set(p.nome, p.id));

  const disciplinasTurma = turmaDiscsTodos
    .filter((td) => td.professorId != null)
    .map((td) => {
      const turma = turmaMap.get(td.turmaId)!;
      const disc = disciplinaMap.get(td.disciplinaId);
      const prof = professorMap.get(td.professorId!);
      const codigoSae = disc?.codigoSae ?? disc?.sigla ?? String(td.disciplinaId);
      chaveParaIds.set(`${turma.nome}||${codigoSae}`, { turmaId: td.turmaId, disciplinaId: td.disciplinaId });
      return {
        turma: turma.nome,
        codigoSae,
        nome: disc?.nome ?? `Disciplina #${td.disciplinaId}`,
        aulasSemana: td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,
        professor: prof?.nome ?? `Professor #${td.professorId}`,
        maxAulasDia: td.maxAulasConsecutivasDia ?? 2,
      };
    })
    .filter((d) => d.aulasSemana > 0);

  if (disciplinasTurma.length === 0) {
    res.status(400).json({ error: "Nenhuma disciplina com carga horária > 0 e professor definido para este turno" });
    return;
  }

  const professorIdsUsados = new Set(turmaDiscsTodos.map((td) => td.professorId).filter((id): id is number => id != null));
  const bloqueiosProfessor = disponibilidades
    .filter((d) => professorIdsUsados.has(d.professorId) && !d.disponivel && (d.turno === turno || d.turno == null))
    .map((d) => ({
      professor: professorMap.get(d.professorId)?.nome ?? `Professor #${d.professorId}`,
      dia: d.diaSemana,
      aula: d.horarioSlot,
    }));

  const aulasPorDia = horarioSlotsTurno.length > 0
    ? Math.max(...horarioSlotsTurno.map((s) => s.numeroAula))
    : 6;

  const payload = {
    turno,
    aulasPorDia,
    turmas: turmasDoTurno.map((t) => ({ nome: t.nome, turno: t.turno })),
    disciplinasTurma,
    bloqueiosProfessor,
    tempoLimiteS: tempoLimiteS ?? 120,
  };

  let resultado: {
    status: string;
    otimo: boolean;
    viavel: boolean;
    tempoResolucaoS: number;
    mensagem?: string;
    aulas: Array<{ turma: string; codigoSae: string; disciplina: string; professor: string; dia: number; aula: number }>;
  };

  try {
    const controller = new AbortController();
    const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${CPSAT_SERVICE_URL}/gerar-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Serviço CP-SAT respondeu ${response.status}: ${errBody}`);
    }
    resultado = await response.json();
  } catch (err) {
    res.status(502).json({
      error: "Não foi possível gerar a grade com o motor CP-SAT.",
      detalhe: err instanceof Error ? err.message : String(err),
      dica: "Verifique se o serviço nexgrade-cpsat está no ar (pode estar hibernado se estiver no free tier do Render).",
    });
    return;
  }

  if (!resultado.viavel) {
    res.status(422).json({
      error: "INVIÁVEL",
      status: resultado.status,
      mensagem: resultado.mensagem ?? "Não existe grade possível com os dados atuais.",
    });
    return;
  }

  await db.delete(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId));

  const linhasParaGravar: Array<{
    escolaId: string; nome: string; turmaId: number; disciplinaId: number;
    professorId: number; diaSemana: number; numeroAula: number;
  }> = [];
  const naoMapeadas: typeof resultado.aulas = [];

  for (const aula of resultado.aulas) {
    const ids = chaveParaIds.get(`${aula.turma}||${aula.codigoSae}`);
    const professorId = nomeParaProfessorId.get(aula.professor);
    if (!ids || !professorId) {
      naoMapeadas.push(aula);
      continue;
    }
    linhasParaGravar.push({
      escolaId,
      nome: nomeExperimental,
      turmaId: ids.turmaId,
      disciplinaId: ids.disciplinaId,
      professorId,
      diaSemana: aula.dia,
      numeroAula: aula.aula,
    });
  }

  if (linhasParaGravar.length === 0) {
    res.status(500).json({
      error: "O CP-SAT devolveu uma grade, mas nenhuma aula pôde ser mapeada de volta para os IDs do banco.",
      naoMapeadas,
    });
    return;
  }

  const gravados = await db.insert(horariosExperimentaisTable).values(linhasParaGravar).returning();

  res.json({
    nomeExperimental,
    turno,
    status: resultado.status,
    otimo: resultado.otimo,
    tempoResolucaoS: resultado.tempoResolucaoS,
    totalTurmas: turmasDoTurno.length,
    totalSlots: gravados.length,
    naoMapeadas: naoMapeadas.length,
    ...(naoMapeadas.length > 0 ? { detalheNaoMapeadas: naoMapeadas } : {}),
    mensagem: `Grade gerada como experimento "${nomeExperimental}". Revise e use POST /experimentais/${nomeExperimental}/promover para aplicar como oficial.`,
  });
});

export default router;
