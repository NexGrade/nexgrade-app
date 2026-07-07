import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { turmasTable } from "./turmas";
import { disciplinasTable } from "./disciplinas";
import { professoresTable } from "./professores";

export const horariosTable = pgTable("horarios", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull().references(() => disciplinasTable.id, { onDelete: "cascade" }),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  numeroAula: integer("numero_aula").notNull(),
  sala: text("sala"),
  versaoGrade: text("versao_grade").default("oficial"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHorarioSchema = createInsertSchema(horariosTable).omit({ id: true, createdAt: true });
export type InsertHorario = z.infer<typeof insertHorarioSchema>;
export type Horario = typeof horariosTable.$inferSelect;
