import { pgTable, serial, timestamp, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const horariosExperimentaisTable = pgTable("horarios_experimentais", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  turmaId: integer("turma_id").notNull(),
  disciplinaId: integer("disciplina_id").notNull(),
  professorId: integer("professor_id").notNull(),
  diaSemana: integer("dia_semana").notNull(),
  numeroAula: integer("numero_aula").notNull(),
  sala: text("sala"),
  ativo: boolean("ativo").notNull().default(true),
  criadoPor: text("criado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHorarioExperimentalSchema = createInsertSchema(horariosExperimentaisTable).omit({ id: true, createdAt: true });
export type InsertHorarioExperimental = z.infer<typeof insertHorarioExperimentalSchema>;
export type HorarioExperimental = typeof horariosExperimentaisTable.$inferSelect;
