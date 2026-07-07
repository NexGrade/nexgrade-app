import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planosTable = pgTable("planos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  preco: integer("preco").notNull().default(0),
  maxProfessores: integer("max_professores").notNull().default(10),
  maxTurmas: integer("max_turmas").notNull().default(5),
  temIA: boolean("tem_ia").notNull().default(false),
  temExport: boolean("tem_export").notNull().default(false),
  temImport: boolean("tem_import").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const escolasTable = pgTable("escolas", {
  id: text("id").primaryKey(),
  nomeFantasia: text("nome_fantasia").notNull(),
  cnpj: text("cnpj"),
  cidade: text("cidade"),
  estado: text("estado").notNull().default("SP"),
  modalidade: text("modalidade").notNull().default("regular"),
  planoId: integer("plano_id").references(() => planosTable.id),
  clerkOrgId: text("clerk_org_id").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planoAtivo: boolean("plano_ativo").notNull().default(true),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlanoSchema = createInsertSchema(planosTable).omit({ id: true, createdAt: true });
export type InsertPlano = z.infer<typeof insertPlanoSchema>;
export type Plano = typeof planosTable.$inferSelect;

export const insertEscolaSchema = createInsertSchema(escolasTable).omit({ createdAt: true, updatedAt: true });
export type InsertEscola = z.infer<typeof insertEscolaSchema>;
export type Escola = typeof escolasTable.$inferSelect;
