import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const comunicadosTable = pgTable("comunicados", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem").notNull(),
  tipo: text("tipo").notNull().default("geral"),
  turmaId: integer("turma_id"),
  professorId: integer("professor_id"),
  lida: boolean("lida").notNull().default(false),
  autorNome: text("autor_nome").notNull().default("Sistema"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertComunicadoSchema = createInsertSchema(comunicadosTable).omit({ id: true, createdAt: true, lida: true });
export type InsertComunicado = z.infer<typeof insertComunicadoSchema>;
export type Comunicado = typeof comunicadosTable.$inferSelect;

