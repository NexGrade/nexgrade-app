import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { professoresTable } from "./professores";

// [RECURSOS-TABLETS] (17/10/2026) Equipamento contado por UNIDADE (ex.: carrinho de tablets, 30).
// Diferente da sala: varios professores reservam o mesmo recurso na mesma aula, desde que a soma
// das quantidades nao passe do total. A conta e feita na API, dentro de transacao.
export const recursosTable = pgTable(
  "recursos",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    nome: text("nome").notNull(),
    quantidadeTotal: integer("quantidade_total").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    escolaNomeUnico: uniqueIndex("recursos_escola_nome_idx").on(table.escolaId, table.nome),
  }),
);

export const reservasRecursosTable = pgTable("reservas_recursos", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  recursoId: integer("recurso_id")
    .notNull()
    .references(() => recursosTable.id, { onDelete: "cascade" }),
  professorId: integer("professor_id")
    .notNull()
    .references(() => professoresTable.id, { onDelete: "cascade" }),
  data: date("data", { mode: "string" }).notNull(),
  diaSemana: integer("dia_semana").notNull(),
  numeroAula: integer("numero_aula").notNull(),
  turno: text("turno").notNull(),
  quantidade: integer("quantidade").notNull(),
  titulo: text("titulo").notNull(),
  observacoes: text("observacoes"),
  // "confirmada" | "cancelada" (tablets confirmam na hora)
  status: text("status").notNull().default("confirmada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Recurso = typeof recursosTable.$inferSelect;
export type ReservaRecurso = typeof reservasRecursosTable.$inferSelect;
