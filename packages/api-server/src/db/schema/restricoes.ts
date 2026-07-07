import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasRef, professoresRef } from "./referencias-existentes";
import { diaSemanaEnum } from "./enums";
import { configuracaoHorario } from "./horarios";
import { turmas } from "./turmas";
import { disciplinas } from "./disciplinas";

/**
 * [MÉDIA] indisponibilidade_professor — tabela pivô cruzando professor,
 * dia da semana e slot de aula, com status de bloqueio. O algoritmo é
 * estritamente proibido de alocar o docente nesses horários.
 *
 * Espelha a matriz visual de indisponibilidade vista no concorrente:
 * uma célula por (professor, dia, slot).
 */
export const indisponibilidadeProfessor = pgTable(
  "indisponibilidade_professor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    professorId: uuid("professor_id")
      .notNull()
      .references(() => professoresRef.id, { onDelete: "cascade" }),
    diaSemana: diaSemanaEnum("dia_semana").notNull(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => configuracaoHorario.id, { onDelete: "cascade" }),
    bloqueado: boolean("bloqueado").notNull().default(true),
    /** Motivo opcional (ex.: "outro emprego", "acúmulo em outra escola"). */
    motivo: varchar("motivo", { length: 255 }),
    anoLetivo: integer("ano_letivo").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    professorSlotUnique: uniqueIndex("indisponibilidade_prof_slot_unique").on(
      table.professorId,
      table.diaSemana,
      table.slotId,
      table.anoLetivo
    ),
  })
);

/**
 * [MÉDIA] Aula Fixa — constraint manual que trava uma aula específica
 * (professor + turma + disciplina) num dia/slot exato, antes de rodar o
 * algoritmo. Essencial para professores com disponibilidade muito restrita.
 *
 * Duas unicidades são mantidas por padrão (comentadas onde relevante):
 * uma turma não pode ter duas aulas fixas no mesmo dia/slot, e por
 * enquanto também impedimos o mesmo professor em dois lugares ao mesmo
 * tempo — o motor deve respeitar as duas ao gerar o restante da grade.
 */
export const aulasFixas = pgTable(
  "aulas_fixas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolasRef.id, { onDelete: "cascade" }),
    professorId: uuid("professor_id")
      .notNull()
      .references(() => professoresRef.id, { onDelete: "cascade" }),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => turmas.id, { onDelete: "cascade" }),
    disciplinaId: uuid("disciplina_id")
      .notNull()
      .references(() => disciplinas.id, { onDelete: "cascade" }),
    diaSemana: diaSemanaEnum("dia_semana").notNull(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => configuracaoHorario.id, { onDelete: "cascade" }),
    anoLetivo: integer("ano_letivo").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    turmaSlotUnique: uniqueIndex("aulas_fixas_turma_slot_unique").on(
      table.turmaId,
      table.diaSemana,
      table.slotId,
      table.anoLetivo
    ),
    professorSlotUnique: uniqueIndex("aulas_fixas_professor_slot_unique").on(
      table.professorId,
      table.diaSemana,
      table.slotId,
      table.anoLetivo
    ),
  })
);
