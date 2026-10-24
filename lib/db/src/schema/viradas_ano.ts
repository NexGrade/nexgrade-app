// [VIRADA-ANO] (24/10/2026) Virada do ano letivo: uma linha por escola e ano de destino.
// status: "liberada" (a Nexus Core liberou antes do fim do ano letivo), "feita" (virou; o backup
// guarda tudo o que foi mudado ou apagado) ou "desfeita" (voltou ao estado do backup).
import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const viradasAnoTable = pgTable("viradas_ano", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  anoDe: integer("ano_de").notNull(),
  anoPara: integer("ano_para").notNull(),
  status: text("status").notNull(), // liberada | feita | desfeita
  backup: jsonb("backup"), // estado antes da virada (turmas, vinculos, grade, experimentos, disponibilidade, professores)
  resumo: jsonb("resumo"), // contagens do que mudou, para a tela
  feitaPor: text("feita_por"),
  liberadaPor: text("liberada_por"),
  feitaEm: timestamp("feita_em", { withTimezone: true }),
  desfeitaEm: timestamp("desfeita_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("viradas_ano_escola_idx").on(t.escolaId, t.anoPara)]);

export type ViradaAno = typeof viradasAnoTable.$inferSelect;
