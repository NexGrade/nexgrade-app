import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasRef, professoresRef } from "./referencias-existentes";
import { turnoEnum } from "./enums";
import { matrizSeries } from "./matriz-curricular";
import { disciplinas } from "./disciplinas";

/**
 * Turma. Nome confirmado com dados reais no formato
 * [Série][Letra] [Sufixo Curso] — ex.: 8MA, 1MA EM, 2MA ADM, 2MC FAR, 1ME DOC.
 *
 * sufixoItinerario fica nullable e é apenas informativo/de exibição — a
 * turma já carrega o itinerário de fato via matrizSerieId -> matrizCurricular -> curso.
 */
export const turmas = pgTable(
  "turmas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolasRef.id, { onDelete: "cascade" }),
    matrizSerieId: uuid("matriz_serie_id").references(() => matrizSeries.id, {
      onDelete: "set null",
    }),
    /** Nome completo tal como usado na escola, ex.: "2MA ADM". */
    nome: varchar("nome", { length: 30 }).notNull(),
    turno: turnoEnum("turno").notNull(),
    anoLetivo: integer("ano_letivo").notNull(),
    /** [BAIXA] Ex.: "ADM", "DES", "FAR", "MA", "DOC" — apenas leitura/relatório. */
    sufixoItinerario: varchar("sufixo_itinerario", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    escolaNomeAnoUnique: uniqueIndex("turmas_escola_nome_ano_unique").on(
      table.escolaId,
      table.nome,
      table.anoLetivo
    ),
  })
);

/**
 * Vínculo docente: qual professor leciona qual disciplina para qual turma,
 * e quantas aulas semanais. Suporta múltiplos professores dividindo a
 * carga de uma mesma disciplina (co-docência) — nesse caso, criar uma
 * linha por professor com a parte de aulasSemanais que cabe a cada um.
 */
export const turmaDisciplinaProfessor = pgTable(
  "turma_disciplina_professor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => turmas.id, { onDelete: "cascade" }),
    disciplinaId: uuid("disciplina_id")
      .notNull()
      .references(() => disciplinas.id, { onDelete: "restrict" }),
    professorId: uuid("professor_id")
      .notNull()
      .references(() => professoresRef.id, { onDelete: "restrict" }),
    aulasSemanais: integer("aulas_semanais").notNull(),
    anoLetivo: integer("ano_letivo").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    vinculoUnique: uniqueIndex("turma_disc_prof_unique").on(
      table.turmaId,
      table.disciplinaId,
      table.professorId,
      table.anoLetivo
    ),
  })
);
