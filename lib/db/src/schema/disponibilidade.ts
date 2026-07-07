import { pgTable, serial, timestamp, integer, boolean, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { professoresTable } from "./professores";

export const disponibilidadeTable = pgTable("disponibilidade_professores", {
  id: serial("id").primaryKey(),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  horarioSlot: integer("horario_slot").notNull(),
  disponivel: boolean("disponivel").notNull().default(true),
  motivo: text("motivo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDisponibilidadeSchema = createInsertSchema(disponibilidadeTable).omit({ id: true, createdAt: true });
export type InsertDisponibilidade = z.infer<typeof insertDisponibilidadeSchema>;
export type Disponibilidade = typeof disponibilidadeTable.$inferSelect;
