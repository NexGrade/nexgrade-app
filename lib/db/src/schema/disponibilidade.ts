import { pgTable, serial, timestamp, integer, boolean, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { professoresTable } from "./professores";

export const disponibilidadeTable = pgTable("disponibilidade_professores", {
  id: serial("id").primaryKey(),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  horarioSlot: integer("horario_slot").notNull(),
  disponivel: boolean("disponivel").notNull().default(true),
  motivo: text("motivo"),
  // RNF-SEED-01: turno a que esse bloqueio pertence ("matutino" |
  // "vespertino" | "noturno"). Necessário para validar se a
  // hora-atividade obrigatória está concentrada no MESMO turno das
  // aulas do professor (Resolução SEED n.º 7.200/2025, art. 11, §4º) —
  // sem isso não dá pra distinguir HA da manhã de HA da noite só pelo
  // número do slot. Opcional por compatibilidade com registros antigos.
  turno: text("turno"),
  // RNF-SEED-01: distingue um bloqueio de Hora-Atividade obrigatória
  // (Resolução SEED n.º 7.200/2025, art. 11) de qualquer outra
  // indisponibilidade (ex. professor não trabalha nesse dia). Usado
  // para validar se o professor tem horas-atividade suficientes
  // marcadas, e se elas estão concentradas no mesmo turno das aulas
  // (art. 11, §4º) quando ele tem até 19 aulas nesse turno.
  horaAtividadeObrigatoria: boolean("hora_atividade_obrigatoria").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDisponibilidadeSchema = createInsertSchema(disponibilidadeTable).omit({ id: true, createdAt: true });
export type InsertDisponibilidade = z.infer<typeof insertDisponibilidadeSchema>;
export type Disponibilidade = typeof disponibilidadeTable.$inferSelect;
