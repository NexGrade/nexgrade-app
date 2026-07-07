import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiConversasTable = pgTable("ai_conversas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  titulo: text("titulo").notNull().default("Nova conversa"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const aiMensagensTable = pgTable("ai_mensagens", {
  id: serial("id").primaryKey(),
  conversaId: integer("conversa_id").notNull().references(() => aiConversasTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiConversaSchema = createInsertSchema(aiConversasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiConversa = z.infer<typeof insertAiConversaSchema>;
export type AiConversa = typeof aiConversasTable.$inferSelect;
export type AiMensagem = typeof aiMensagensTable.$inferSelect;
