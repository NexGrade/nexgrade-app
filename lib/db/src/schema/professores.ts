import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { disciplinasTable } from "./disciplinas";
export const professoresTable = pgTable("professores", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  cpf: text("cpf"),
  matricula: text("matricula"),
  telefone: text("telefone"),
  cargaHorariaTotal: integer("carga_horaria_total").notNull().default(20),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export const professorDisciplinasTable = pgTable("professor_disciplinas", {
  id: serial("id").primaryKey(),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  // [FIX] Antes desta coluna nao tinha nenhuma foreign key -- apagar uma
  // disciplina em uso por um professor deixava esse vinculo orfao
  // silenciosamente (causa raiz do bug "#917" aparecendo na tela de
  // Professores). Com onDelete: "cascade", apagar uma disciplina agora
  // remove automaticamente os vinculos professor-disciplina associados
  // a ela, em vez de deixar referencia quebrada.
  disciplinaId: integer("disciplina_id").notNull().references(() => disciplinasTable.id, { onDelete: "cascade" }),
});
export const insertProfessorSchema = createInsertSchema(professoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfessor = z.infer<typeof insertProfessorSchema>;
export type Professor = typeof professoresTable.$inferSelect;
