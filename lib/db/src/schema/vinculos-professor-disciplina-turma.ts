import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { turmasTable } from "./turmas";
import { disciplinasTable } from "./disciplinas";
import { professoresTable } from "./professores";

// [NOVO] Vinculo Professor-Disciplina-Turma — quem ensina o que, SEM
// hora marcada (diferente de aulas_fixas, que trava dia/slot exato).
// Registra o requisito ("Katia da Matematica pra 1MA EM, X aulas/
// semana") pra o motor de geracao escolher o melhor dia/horario
// sozinho, em vez de depender de uma celula fixa na grade. Criado em
// 2026-09-17 como primeiro passo aditivo (so schema + migracao de
// vinculo existente) -- o motor de geracao (CP-SAT e heuristico) AINDA
// NAO le essa tabela; isso fica pra uma proxima sessao, com mais tempo
// pra desenhar a integracao com seguranca.
export const vinculosProfessorDisciplinaTurmaTable = pgTable("vinculos_professor_disciplina_turma", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull().references(() => disciplinasTable.id, { onDelete: "cascade" }),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  aulasPorSemana: integer("aulas_por_semana").notNull(),
  anoLetivo: integer("ano_letivo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVinculoProfessorDisciplinaTurmaSchema = createInsertSchema(vinculosProfessorDisciplinaTurmaTable).omit({ id: true, createdAt: true });
export type InsertVinculoProfessorDisciplinaTurma = z.infer<typeof insertVinculoProfessorDisciplinaTurmaSchema>;
export type VinculoProfessorDisciplinaTurma = typeof vinculosProfessorDisciplinaTurmaTable.$inferSelect;
