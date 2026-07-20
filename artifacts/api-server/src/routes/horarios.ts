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

  const [turmaDiscs, disciplinas, professores, profDiscs, configGeminadas, limitesProfessor] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.turmaId, turmaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable)
      .where(and(eq(professoresTable.escolaId, escolaId)))
      .then(rows => rows.filter(p => p.ativo)),
    db.select().from(professorDisciplinasTable),
    db.select().from(configuracoesTable)
      .where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_MAX_GEMINADAS_PADRAO)))
      .then(r => r[0]),
    db.select().from(limitesDiariosProfessorTable).where(eq(limitesDiariosProfessorTable.escolaId, escolaId)),
  ]);

  if (turmaDiscs.length === 0) throw new Error("A turma não tem disciplinas cadastradas");

  const maxGeminadasPadrao = typeof configGeminadas?.valor === "number"
    ? configGeminadas.valor
    : DEFAULT_MAX_GEMINADAS;

  function limiteDiarioProfessor(professorId: number): number {
    const especifico = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === turmaId);
    if (especifico) return especifico.maxAulasPorDia;
    const padrao = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === null);
    if (padrao) return padrao.maxAulasPorDia;
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
  if (!substituir) {
    existing.forEach(s => {
      const key = `${s.professorId}-${s.diaSemana}`;
      aulasProfessorNaTurmaPorDia[key] = (aulasProfessorNaTurmaPorDia[key] ?? 0) + 1;
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

    if (!diasUsadosPorProfessor[professorId]) diasUsadosPorProfessor[professorId] = new Set();
    diasUsadosPorProfessor[professorId].add(dia);
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

    // [FIX] Antes, mesmo quando a turma já tinha um professor
    // específico vinculado pra essa disciplina (turmaDisciplinasTable.
    // professorId -- o dado real que veio da secretaria), o gerador
    // ignorava isso e escolhia entre QUALQUER professor genericamente
    // ligado à disciplina via professor_disciplinas (que pode incluir
    // gente que só dá essa matéria em OUTRA turma). Resultado: a grade
    // gerada podia colocar um professor que nunca deu aula naquela
    // turma, só porque ele estava livre no horário e "sabe" a matéria
    // em geral. Agora, se a turma já tem o professor certo definido,
    // usa só ele -- o pool genérico vira só um fallback pra quando
    // ainda não há vínculo específico (turma nova, sem professor
    // definido ainda).
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
            && respeitaLimiteComplementar(p.id, dia),
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
              && respeitaLimiteComplementar(p.id, dia),
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

  // [FIX] Antes: buscava TODOS os horarios da escola, filtrava em
  // JavaScript, e ainda por cima chamava enrichSlot() individualmente
  // pra cada linha filtrada -- 3 consultas ao banco (disciplina,
  // professor, turma) POR AULA, uma de cada vez. Pra um professor com
  // 20-30 aulas, isso virava 60-90 idas e vindas ao banco só pra montar
  // uma tela, deixando o carregamento bem lento. Agora filtra direto no
  // banco (WHERE) e busca disciplinas/professores/turmas em 3 consultas
  // ÚNICAS (não uma por linha), juntando tudo em memória depois.
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
