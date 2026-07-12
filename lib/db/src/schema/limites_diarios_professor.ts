import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { professoresTable } from "./professores";
import { turmasTable } from "./turmas";

// Regra "complementar" do modelo de distribuição de aulas (ver URÂNIA+
// passos 26-29): limite de aulas diárias para um professor que leciona
// mais de uma disciplina na mesma turma.
//
// turmaId NULO = valor padrão do professor, valendo em qualquer turma
// onde ele dê mais de uma disciplina. turmaId PREENCHIDO = override
// específico pra aquela turma, com prioridade sobre o padrão do
// professor — mesma convenção geral/específico usada em
// disciplinas.cargaSemanal x turma_disciplinas.cargaHorariaSemanalOverride.
//
// Nível GERAL (compactação de carga horária, bloqueio de janelas) fica
// em configuracoesTable, seguindo a convenção já existente de
// "seed_pr.max_aulas_geminadas_padrao" (ver disponibilidade.ts) — não
// precisa de tabela própria, é um valor único por escola.
// Nível ESPECÍFICO de aulas geminadas já existe em
// turma_disciplinas.maxAulasConsecutivasDia.

export const limitesDiariosProfessorTable = pgTable("limites_diarios_professor", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  // Nulo = padrão do professor, válido em qualquer turma dele.
  // Preenchido = override específico pra essa turma.
  turmaId: integer("turma_id").references(() => turmasTable.id, { onDelete: "cascade" }),
  maxAulasPorDia: integer("max_aulas_por_dia").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLimiteDiarioProfessorSchema = createInsertSchema(limitesDiariosProfessorTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLimiteDiarioProfessor = z.infer<typeof insertLimiteDiarioProfessorSchema>;
export type LimiteDiarioProfessor = typeof limitesDiariosProfessorTable.$inferSelect;
