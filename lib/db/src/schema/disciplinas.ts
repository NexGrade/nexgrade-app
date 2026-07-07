import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const disciplinasTable = pgTable("disciplinas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  cargaSemanal: integer("carga_semanal").notNull().default(2),
  cor: text("cor").notNull().default("#6366f1"),
  // Código SAE oficial (origem regulatória — identificador público do
  // Estado do Paraná). Opcional: nem toda escola/disciplina tem um
  // vínculo já mapeado. RF-DISC-01/02.
  codigoSae: text("codigo_sae"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDisciplinaSchema = createInsertSchema(disciplinasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDisciplina = z.infer<typeof insertDisciplinaSchema>;
export type Disciplina = typeof disciplinasTable.$inferSelect;
