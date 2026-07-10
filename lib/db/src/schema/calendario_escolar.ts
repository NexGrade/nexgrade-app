import { pgTable, text, serial, integer, date, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Eventos pontuais do calendário: feriados, recessos, pontos facultativos,
// início/fim de ano letivo, início/fim de trimestre, dias de estudo e planejamento.
export const calendarioEscolarTable = pgTable("calendario_escolar", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  ano: integer("ano").notNull(),
  data: date("data").notNull(),
  tipo: text("tipo").notNull(), // feriado | recesso | ponto_facultativo | estudo_planejamento | inicio_ano_letivo | fim_ano_letivo | inicio_trimestre | fim_trimestre
  descricao: text("descricao").notNull(),
  diaLetivo: boolean("dia_letivo").notNull().default(false), // se conta como dia letivo (aulas normais)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Resumo agregado por trimestre: datas de início/fim e total de dias letivos oficiais.
// Usado para validar carga horária cumprida x exigida por disciplina.
export const trimestresLetivosTable = pgTable("trimestres_letivos", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  ano: integer("ano").notNull(),
  trimestre: integer("trimestre").notNull(), // 1, 2 ou 3
  dataInicio: date("data_inicio").notNull(),
  dataFim: date("data_fim").notNull(),
  diasLetivos: integer("dias_letivos").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCalendarioEscolarSchema = createInsertSchema(calendarioEscolarTable).omit({ id: true, createdAt: true });
export type InsertCalendarioEscolar = z.infer<typeof insertCalendarioEscolarSchema>;
export type CalendarioEscolar = typeof calendarioEscolarTable.$inferSelect;

export const insertTrimestreLetivoSchema = createInsertSchema(trimestresLetivosTable).omit({ id: true, createdAt: true });
export type InsertTrimestreLetivo = z.infer<typeof insertTrimestreLetivoSchema>;
export type TrimestreLetivo = typeof trimestresLetivosTable.$inferSelect;