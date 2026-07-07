import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasRef } from "./referencias-existentes";
import { geminacaoProfessorEnum, regraMultidisciplinaEnum } from "./enums";

/**
 * [MÉDIA] Parâmetros de otimização do motor algorítmico — confirmados
 * como configurações reais de uma tela de cadastro básico do concorrente.
 * Uma linha por escola + período letivo.
 *
 * sincronismoInicio        "Todas as turmas começam as aulas nos mesmos
 *                           horários?" (Sim/Não)
 * geminacaoProfessor       Se o professor tiver duas aulas no dia com a
 *                           mesma turma: variar / sempre juntas / nunca juntas
 * regraMultidisciplina     Quando um professor leciona duas disciplinas
 *                           diferentes na mesma turma no mesmo dia
 * tetoAulasDiaProfessor    Limite diário de aulas por professor (nullable
 *                           = sem limite)
 */
export const configuracaoMotor = pgTable(
  "configuracao_motor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolasRef.id, { onDelete: "cascade" }),
    periodoLetivo: varchar("periodo_letivo", { length: 20 }).notNull(),
    sincronismoInicio: boolean("sincronismo_inicio").notNull().default(true),
    geminacaoProfessor: geminacaoProfessorEnum("geminacao_professor")
      .notNull()
      .default("variar"),
    regraMultidisciplina: regraMultidisciplinaEnum("regra_multidisciplina")
      .notNull()
      .default("permitir_junto"),
    tetoAulasDiaProfessor: integer("teto_aulas_dia_professor"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    escolaPeriodoUnique: uniqueIndex("configuracao_motor_escola_periodo_unique").on(
      table.escolaId,
      table.periodoLetivo
    ),
  })
);
