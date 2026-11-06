// [EXPERIMENTO-COMPLETO] (06/11/2026) Experimento como area de trabalho (pedido da dona): dentro dele se mexe na
// disponibilidade (disponibilidade_experimental), na atribuicao (quem da cada disciplina) e se trocam aulas na grade,
// tudo sem tocar na oficial ate promover.
import { pgTable, serial, timestamp, integer, text, uniqueIndex } from "drizzle-orm/pg-core";
import { professoresTable } from "./professores";
import { turmaDisciplinasTable } from "./turmas";

// Registro do experimento: ele existe mesmo antes de ter aula gerada (ex.: so mudancas de disponibilidade).
export const experimentosTable = pgTable("experimentos", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  nome: text("nome").notNull(),
  criadoPor: text("criado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("experimentos_escola_nome_uq").on(t.escolaId, t.nome)]);

// Atribuicao no experimento: o professor da disciplina da turma (linha de turma_disciplinas) so neste experimento.
// professorId nulo = "sem professor" no experimento.
export const atribuicaoExperimentalTable = pgTable("atribuicao_experimental", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  nome: text("nome").notNull(),
  turmaDisciplinaId: integer("turma_disciplina_id").notNull().references(() => turmaDisciplinasTable.id, { onDelete: "cascade" }),
  professorId: integer("professor_id").references(() => professoresTable.id, { onDelete: "cascade" }),
  criadoPor: text("criado_por"),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("atribuicao_experimental_uq").on(t.escolaId, t.nome, t.turmaDisciplinaId)]);

export type Experimento = typeof experimentosTable.$inferSelect;
export type AtribuicaoExperimental = typeof atribuicaoExperimentalTable.$inferSelect;
