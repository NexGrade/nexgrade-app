// [DISP-EXPERIMENTAL] (06/11/2026) Disponibilidade dentro de um experimento, pedida pelo diretor: testar
// mudancas de disponibilidade (bloqueio, HA, atividade) sem mexer na oficial. Cada linha e o estado de UM
// horario do professor no experimento e vale por cima da linha oficial de mesma chave
// (professor, dia, aula, turno). "Livre" e uma linha com disponivel = true. O experimento e identificado
// pelo nome, como em horarios_experimentais. Ao promover, as linhas vao para disponibilidade_professores.
import { pgTable, serial, timestamp, integer, boolean, text, uniqueIndex } from "drizzle-orm/pg-core";
import { professoresTable } from "./professores";

export const disponibilidadeExperimentalTable = pgTable("disponibilidade_experimental", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  nome: text("nome").notNull(),
  professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  horarioSlot: integer("horario_slot").notNull(),
  turno: text("turno").notNull(),
  disponivel: boolean("disponivel").notNull().default(true),
  motivo: text("motivo"),
  horaAtividadeObrigatoria: boolean("hora_atividade_obrigatoria").notNull().default(false),
  criadoPor: text("criado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("disponibilidade_experimental_chave_uq").on(t.escolaId, t.nome, t.professorId, t.diaSemana, t.horarioSlot, t.turno),
]);

export type DisponibilidadeExperimental = typeof disponibilidadeExperimentalTable.$inferSelect;
