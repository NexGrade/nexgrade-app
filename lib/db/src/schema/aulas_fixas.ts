import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { turmasTable } from "./turmas";
import { disciplinasTable } from "./disciplinas";
import { professoresTable } from "./professores";

// [NOVO] Aula Fixa — constraint manual que trava uma aula específica
// (professor + turma + disciplina) num dia/slot exato, antes de rodar o
// algoritmo. Essencial para professores com disponibilidade muito
// restrita. Não existia equivalente no schema anterior.

export const aulasFixasTable = pgTable("aulas_fixas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull().references(() => disciplinasTable.id, { onDelete: "cascade" }),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(), // mesma convenção de horariosTable/disponibilidadeTable
  numeroAula: integer("numero_aula").notNull(), // bate com horarioSlotsTable.numeroAula
  anoLetivo: integer("ano_letivo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAulaFixaSchema = createInsertSchema(aulasFixasTable).omit({ id: true, createdAt: true });
export type InsertAulaFixa = z.infer<typeof insertAulaFixaSchema>;
export type AulaFixa = typeof aulasFixasTable.$inferSelect;
