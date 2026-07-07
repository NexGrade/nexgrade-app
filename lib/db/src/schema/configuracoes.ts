import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const configuracoesTable = pgTable("configuracoes", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  chave: text("chave").notNull(),
  valor: jsonb("valor"),
  descricao: text("descricao"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConfiguracaoSchema = createInsertSchema(configuracoesTable).omit({ id: true, updatedAt: true });
export type InsertConfiguracao = z.infer<typeof insertConfiguracaoSchema>;
export type Configuracao = typeof configuracoesTable.$inferSelect;
