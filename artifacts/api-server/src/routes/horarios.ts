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
  // [DEPRECADO] Não é mais usado para decidir quantas aulas por dia
  // existem — isso agora vem de horario_slots, calculado automaticamente
  // a partir do turno + nivelEnsino da turma (ver busca de
  // `aulasPorDiaReal` abaixo). Mantido opcional só para não quebrar
  // chamadas antigas (ex.: routes/ai.ts) que ainda possam enviar esse
  // campo — o valor recebido é ignorado.
  aulaspordia?: number;
  substituir: boolean;
  reduzirJanelas: boolean;
  fatorPedagogico: boolean;
  // Opcional (default false) para não quebrar chamadas existentes de
  // gerarAlgoritmo feitas antes desta opção existir (ver routes/ai.ts).
  compactarCargaHoraria?: boolean;
  experimental: boolean;
  nomeExperimental?: string;
}

// Chave de configuração geral (nível "geral" do modelo de distribuição —
// ver limites_diarios_professor.ts para os níveis "específico" e
// "complementar"). Mesma convenção já usada em disponibilidade.ts.
const CHAVE_MAX_GEMINADAS_PADRAO = "seed_pr.max_aulas_geminadas_padrao";
const DEFAULT_MAX_GEMINADAS = 2;

export async function gerarAlgoritmo(opts: GerarOpts) {
  const {
    escolaId, turmaId, substituir, reduzirJanelas,
    fatorPedagogico, compactarCargaHoraria = false, experimental, nomeExperimental,
  } = opts;
  const useExperimental = experimental && nomeExperimental;

  // RNF-SEG-04: a turma precisa pertencer à escola do usuário autenticado
  // antes de qualquer leitura/escrita — todo o restante da função assume
  // isso para não vazar/alterar dados de outra escola.
  const turma = await db.select().from(turmasTable)
    .where(and(eq(turmasTable.id, turmaId), eq(turmasTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!turma) throw new Error("Turma não encontrada");

  // [NOVO] A quantidade real de aulas por dia vem de horario_slots, não
  // mais de um número digitado no formulário — evita o erro comum de
  // gerar horário noturno pedindo 6 aulas (só existem 5) ou matutino
  // Fundamental pedindo 6 (só existem 5; só Médio/Técnico tem 6).
  // Matutino tem dois esquemas reais diferentes dependendo do nível de
  // ensino da turma; vespertino e noturno são uniformes (nivelEnsino
  // nulo na tabela).
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

  // RNF-DIST-01 (nível geral): padrão de aulas geminadas da escola,
  // usado quando a turma/disciplina não tem override em
  // turma_disciplinas.maxAulasConsecutivasDia.
  const maxGeminadasPadrao = typeof configGeminadas?.valor === "number"
    ? configGeminadas.valor
    : DEFAULT_MAX_GEMINADAS;

  // RNF-DIST-03 (nível complementar): limite diário de um professor que
  // leciona mais de uma disciplina na mesma turma. turmaId nulo = padrão
  // do professor; turmaId preenchido = override específico, com
  // prioridade sobre o padrão (ver limites_diarios_professor.ts).
  function limiteDiarioProfessor(professorId: number): number {
    const especifico = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === turmaId);
    if (especifico) return especifico.maxAulasPorDia;
    const padrao = limitesProfessor.find(l => l.professorId === professorId && l.turmaId === null);
    if (padrao) return padrao.maxAulasPorDia;
    return Infinity; // sem limite configurado — não restringe
  }

  const professorIds = professores.map(p => p.id);
  const disponibilidades = professorIds.length
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, professorIds))
    : [];

  // RF-ALOC-04 / RF-PROF-04: um professor nunca pode ser alocado num
  // dia/período em que sua disponibilidade esteja marcada como
  // indisponível. A tabela só precisa registrar exceções — a ausência de
  // registro é tratada como disponível (default da coluna `disponivel`).
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

  // Se `substituir`, a grade atual desta turma não conta como ocupada —
  // ela vai ser apagada e regravada. Simulamos isso em memória (sem
  // apagar do banco ainda) filtrando esses slots da checagem de conflito.
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

  // Correção do bug de "bloqueio de janelas": antes, `aulasProf` era
  // calculado só a partir de `allSlots` (o banco no início da execução),
  // então uma disciplina alocada mais cedo NESTA MESMA geração não
  // contava como "aula adjacente" pra próxima disciplina do loop — ou
  // seja, numa turma nova (o caso mais comum), o bloqueio de janelas não
  // fazia nada. Agora `aulasPorProfessorDia` é seedado do banco e
  // atualizado a cada `alocar()`, refletindo a geração em andamento.
  const aulasPorProfessorDia: Record<number, number[]> = {};
  baseSlots.forEach(s => {
    // Indexado só por professor; dia/aula ficam guardados juntos como
    // `dia*100+aula` pra permitir checagem por dia específico abaixo.
    if (!aulasPorProfessorDia[s.professorId]) aulasPorProfessorDia[s.professorId] = [];
    aulasPorProfessorDia[s.professorId].push(s.diaSemana * 100 + s.numeroAula);
  });

  // RNF-DIST-03: contagem de aulas do professor NESTA turma, por dia
  // (soma todas as disciplinas que ele dá nesta turma) — é o dado que a
  // regra complementar limita. Reinicia a cada geração porque só conta
  // o que está sendo alocado agora; combinações antigas já gravadas
  // entram via `existing` quando `!substituir`.
  const aulasProfessorNaTurmaPorDia: Record<string, number> = {};
  if (!substituir) {
    existing.forEach(s => {
      const key = `${s.professorId}-${s.diaSemana}`;
      aulasProfessorNaTurmaPorDia[key] = (aulasProfessorNaTurmaPorDia[key] ?? 0) + 1;
    });
  }

  // RNF-DIST-01 (compactação, nível geral): dias distintos que cada
  // professor já está lecionando, nesta escola, nesta geração — usado
  // pra preferir concentrar o professor em menos dias em vez de
  // espalhar aulas dele pela semana inteira.
  const diasUsadosPorProfessor: Record<number, Set<number>> = {};
  baseSlots.forEach(s => {
    if (!diasUsadosPorProfessor[s.professorId]) diasUsadosPorProfessor[s.professorId] = new Set();
    diasUsadosPorProfessor[s.professorId].add(s.diaSemana);
  });

  const DIAS = [0, 1, 2, 3, 4];
  const diasBase = fatorPedagogico ? [1, 3, 2, 4, 0] : DIAS;
  // [ALTERADO] Antes vinha de `opts.aulaspordia` (digitado no
  // formulário); agora vem de `aulasPorDiaReal`, calculado acima a
  // partir de horario_slots — reflete o esquema real da turma.
  const AULAS = Array.from({ length: aulasPorDiaReal }, (_, i) => i + 1);

  // RF-TUR-02: a carga horária efetiva de uma disciplina NESTA turma é o
  // override vindo da Matriz Curricular aplicada (ver
  // routes/turmas.ts > POST /:id/aplicar-matriz), com fallback para a
  // carga global de disciplinasTable quando a disciplina foi vinculada
  // manualmente (turma sem matriz aplicada).
  function cargaEfetiva(td: typeof turmaDiscs[number], disc: typeof disciplinas[number] | undefined): number {
    return td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0;
  }

  // RNF-SEED-03: máximo de aulas consecutivas (geminadas) desta
  // disciplina, nesta turma — override específico com prioridade sobre
  // o padrão geral da escola (ver maxGeminadasPadrao acima).
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

  // Verifica se alocar `professorId` no `dia` respeitaria o limite
  // complementar (professor com múltiplas disciplinas na mesma turma).
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

    const profsParaDisc = profDiscs
      .filter(pd => pd.disciplinaId === td.disciplinaId)
      .map(pd => professores.find(p => p.id === pd.professorId))
      .filter(Boolean) as typeof professores;

    if (profsParaDisc.length === 0) {
      conflitos.push(`Sem professor habilitado para "${disc.nome}"`);
      continue;
    }

    const alocacaoPorDia: Record<number, number> = {};

    // Compactação (nível geral): quando ativa, reordena os dias
    // preferindo aqueles em que algum dos professores desta disciplina
    // já está alocado — concentra o professor em menos dias distintos,
    // em vez de espalhar pela semana.
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

  // RNF-ROBUSTEZ-01: gravação atômica. `db.transaction` garante que o
  // apagar (se `substituir`) e todos os inserts abaixo aconteçam como uma
  // unidade só — se qualquer insert falhar (ex. queda de conexão no meio),
  // o Postgres desfaz TUDO sozinho, e a turma mantém a grade anterior
  // intacta em vez de ficar com metade apagada e metade regravada.
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
      // [DEPRECADO] aulaspordia nao e mais usado internamente (ver
      // gerarAlgoritmo) -- mantido apenas para nao quebrar o contrato da
      // API para clientes antigos que ainda enviem esse campo.
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
