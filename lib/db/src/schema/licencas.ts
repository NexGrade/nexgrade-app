import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { professoresTable } from "./professores";

export const licencasTable = pgTable("licencas_professores", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  professorSubstitutoId: integer("professor_substituto_id"),
  dataInicio: date("data_inicio", { mode: "string" }).notNull(),
  dataFim: date("data_fim", { mode: "string" }).notNull(),
  tipo: text("tipo").notNull().default("medica"),
  motivo: text("motivo"),
  aprovada: boolean("aprovada").notNull().default(false),
  comunicadoEnviado: boolean("comunicado_enviado").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLicencaSchema = createInsertSchema(licencasTable).omit({ id: true, createdAt: true, updatedAt: true, comunicadoEnviado: true });
export type InsertLicenca = z.infer<typeof insertLicencaSchema>;
export type Licenca = typeof licencasTable.$inferSelect;
