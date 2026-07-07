import {
  pgTable,
  uuid,
  integer,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasRef } from "./referencias-existentes";
import { turnoEnum } from "./enums";

/**
 * [ALTA] Janelas de aula (slots) por turno. Confirmado nas grades reais:
 * cada turno tem uma quantidade fixa de aulas com horário de início
 * próprio — ex.: manhã com 6 aulas (07:30, 08:20, 09:25, 10:15, 11:05,
 * 11:55); noite com 5 aulas a partir de 18:45 (o horário de 18:00
 * aparece bloqueado/inativo na maioria das grades observadas).
 *
 * O motor algorítmico não tem como gerar nada sem essa tabela — é a
 * base de tempo sobre a qual toda alocação acontece.
 */
export const configuracaoHorario = pgTable(
  "configuracao_horario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolasRef.id, { onDelete: "cascade" }),
    turno: turnoEnum("turno").notNull(),
    /** Posição do slot dentro do turno: 1ª aula, 2ª aula, etc. */
    ordemSlot: integer("ordem_slot").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    duracaoMinutos: integer("duracao_minutos").notNull().default(50),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    escolaTurnoSlotUnique: uniqueIndex(
      "configuracao_horario_escola_turno_slot_unique"
    ).on(table.escolaId, table.turno, table.ordemSlot),
  })
);
