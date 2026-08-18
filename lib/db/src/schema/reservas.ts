import { sql } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { horariosTable } from "./horarios";
import { professoresTable } from "./professores";
import { salasTable } from "./salas";

export const reservasTable = pgTable(
  "reservas",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    salaId: integer("sala_id")
      .notNull()
      .references(() => salasTable.id, { onDelete: "cascade" }),
    professorId: integer("professor_id")
      .notNull()
      .references(() => professoresTable.id, { onDelete: "cascade" }),
    horarioId: integer("horario_id").references(() => horariosTable.id, {
      onDelete: "set null",
    }),
    data: date("data", { mode: "string" }).notNull(),
    diaSemana: integer("dia_semana").notNull(),
    numeroAula: integer("numero_aula").notNull(),
    titulo: text("titulo").notNull(),
    observacoes: text("observacoes"),
    // "confirmada" | "pendente" | "cancelada"
    status: text("status").notNull().default("confirmada"),
    prioridadeAplicada: integer("prioridade_aplicada").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // [SEGURANCA] Impede duas reservas ATIVAS (nao canceladas) na
    // mesma sala, mesmo dia, mesma aula -- garantia estrutural do
    // banco contra corrida de concorrencia (duas pessoas reservando
    // ao mesmo tempo), independente da validacao em codigo.
    salaSlotUnico: uniqueIndex("reservas_sala_slot_unico")
      .on(table.escolaId, table.salaId, table.data, table.numeroAula)
      .where(sql`${table.status} != 'cancelada'`),
    // [SEGURANCA] Mesma logica para o professor -- nunca duas
    // reservas ativas dele no mesmo dia/aula.
    professorSlotUnico: uniqueIndex("reservas_professor_slot_unico")
      .on(table.escolaId, table.professorId, table.data, table.numeroAula)
      .where(sql`${table.status} != 'cancelada'`),
  }),
);

export const regrasReservaProfessorTable = pgTable(
  "regras_reserva_professor",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    professorId: integer("professor_id")
      .notNull()
      .references(() => professoresTable.id, { onDelete: "cascade" }),
    limiteSemanal: integer("limite_semanal").notNull().default(2),
    prioridade: integer("prioridade").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    escolaProfessorUnico: uniqueIndex(
      "regras_reserva_professor_escola_professor_idx",
    ).on(table.escolaId, table.professorId),
  }),
);

export const insertReservaSchema = createInsertSchema(reservasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReserva = z.infer<typeof insertReservaSchema>;
export type Reserva = typeof reservasTable.$inferSelect;

export const insertRegraReservaProfessorSchema = createInsertSchema(
  regrasReservaProfessorTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRegraReservaProfessor = z.infer<
  typeof insertRegraReservaProfessorSchema
>;
export type RegraReservaProfessor =
  typeof regrasReservaProfessorTable.$inferSelect;