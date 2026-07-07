import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matrizesCurricularesTable } from "./cursos";

export const turmasTable = pgTable("turmas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  serie: text("serie").notNull(),
  turno: text("turno").notNull().default("matutino"),
  anoLetivo: integer("ano_letivo").notNull(),
  // RF-TUR-01/02: vínculo opcional com a Matriz Curricular (ver
  // cursos.ts) que define a carga horária esperada por disciplina desta
  // turma. Nulo enquanto a turma não estiver associada a uma matriz —
  // widget de aplicação automática ainda não implementado (ver
  // replit.md, seção "Próximos passos").
  matrizCurricularId: integer("matriz_curricular_id").references(() => matrizesCurricularesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const turmaDisciplinasTable = pgTable("turma_disciplinas", {
  id: serial("id").primaryKey(),
  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull(),
  // RF-TUR-02: quando a disciplina veio de uma Matriz Curricular
  // aplicada (ver rota POST /turmas/:id/aplicar-matriz), este campo
  // guarda a carga horária semanal daquela série específica — que tem
  // prioridade sobre `disciplinasTable.cargaSemanal` (global) na hora de
  // gerar horário (routes/horarios.ts) e detectar conflitos
  // (routes/conflitos.ts). Nulo quando a disciplina foi vinculada
  // manualmente (fluxo antigo, sem matriz) — nesse caso o valor global
  // continua sendo usado, sem quebrar turmas já existentes.
  cargaHorariaSemanalOverride: integer("carga_horaria_semanal_override"),
});

export const insertTurmaSchema = createInsertSchema(turmasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTurma = z.infer<typeof insertTurmaSchema>;
export type Turma = typeof turmasTable.$inferSelect;
