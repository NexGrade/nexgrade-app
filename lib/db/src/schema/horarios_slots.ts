import { pgTable, text, serial, timestamp, integer, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [NOVO] Maior gap real encontrado: horarios.ts guarda apenas o resultado
// gerado (numeroAula como número solto, sem saber que horas são de
// verdade). Esta tabela define, por escola e turno, quantas aulas existem
// e a que horas cada uma começa — confirmado nas grades reais analisadas:
// manhã com 6 aulas (07:30, 08:20, 09:25, 10:15, 11:05, 11:55); noite com
// 5 aulas a partir de 18:45 (18:00 aparece bloqueado/inativo na maioria
// das grades observadas).
//
// O motor algorítmico não tem como gerar nada sem essa tabela — é a base
// de tempo sobre a qual toda alocação acontece. horariosTable.numeroAula
// deve corresponder a horarioSlotsTable.numeroAula do mesmo turno.

export const horarioSlotsTable = pgTable("horario_slots", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  turno: text("turno").notNull(), // matutino | vespertino | noturno — mesma convenção de turmasTable.turno
  numeroAula: integer("numero_aula").notNull(), // 1ª aula, 2ª aula, etc. — bate com horariosTable.numeroAula
  horaInicio: time("hora_inicio").notNull(),
  duracaoMinutos: integer("duracao_minutos").notNull().default(50),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHorarioSlotSchema = createInsertSchema(horarioSlotsTable).omit({ id: true, createdAt: true });
export type InsertHorarioSlot = z.infer<typeof insertHorarioSlotSchema>;
export type HorarioSlot = typeof horarioSlotsTable.$inferSelect;
