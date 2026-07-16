import { pgTable, text, serial, timestamp, integer, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { nivelEnsinoEnum } from "./turmas";

// [CORRIGIDO] A analise anterior deste comentario estava incompleta: o
// matutino NAO tem um unico esquema de 6 aulas para todo mundo. Grades
// reais da SEED-PR/Urania (PDFs de junho/2026) confirmam DOIS esquemas
// diferentes dentro do proprio turno matutino, dependendo do nivel de
// ensino da turma:
//   - Fundamental (6o-9o ano): 5 aulas -- 07:30, 08:20, 09:25, 10:15, 11:05
//   - Medio/Tecnico (1a-3a serie): 6 aulas -- as mesmas 5 acima + 11:55
// Vespertino e sempre Fundamental (5 aulas: 13:05, 13:55, 14:45, 15:50,
// 16:40). Noturno e sempre Medio/Tecnico (5 aulas comecando as 18:45;
// 18:00 aparece como horario "vago" nas grades, nunca usado de verdade).
//
// Por isso a coluna nivelEnsino abaixo: so precisa ser preenchida para
// slots do turno "matutino" (onde ha ambiguidade real); em vespertino e
// noturno fica nula, porque o esquema ja e uniforme por natureza do
// turno.
//
// O motor algoritmico nao tem como gerar nada sem essa tabela -- e a base
// de tempo sobre a qual toda alocacao acontece. horariosTable.numeroAula
// deve corresponder a horarioSlotsTable.numeroAula do mesmo turno (e,
// quando aplicavel, do mesmo nivelEnsino).
export const horarioSlotsTable = pgTable("horario_slots", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  turno: text("turno").notNull(), // matutino | vespertino | noturno — mesma convenção de turmasTable.turno
  // [NOVO] Nulo em vespertino/noturno (esquema unico). Obrigatorio
  // diferenciar em matutino: "fundamental" (5 aulas) vs "medio_tecnico"
  // (6 aulas) — ver comentario acima.
  nivelEnsino: nivelEnsinoEnum("nivel_ensino"),
  numeroAula: integer("numero_aula").notNull(), // 1ª aula, 2ª aula, etc. — bate com horariosTable.numeroAula
  horaInicio: time("hora_inicio").notNull(),
  duracaoMinutos: integer("duracao_minutos").notNull().default(50),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertHorarioSlotSchema = createInsertSchema(horarioSlotsTable).omit({ id: true, createdAt: true });
export type InsertHorarioSlot = z.infer<typeof insertHorarioSlotSchema>;
export type HorarioSlot = typeof horarioSlotsTable.$inferSelect;
