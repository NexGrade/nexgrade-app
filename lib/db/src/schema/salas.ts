import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salasTable = pgTable("salas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("sala_aula"),
  capacidade: integer("capacidade").notNull().default(35),
  ativa: boolean("ativa").notNull().default(true),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSalaSchema = createInsertSchema(salasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSala = z.infer<typeof insertSalaSchema>;
export type Sala = typeof salasTable.$inferSelect;
