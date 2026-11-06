// [PRESENCA-PEDAGOGIA] (28/10/2026) Lista de presenca dos professores, marcada pela pedagogia
// aula a aula (Presente, Falta, Atraso, Substituido). Uma linha por professor + dia + turno + aula;
// aula sem linha = ainda nao marcada. A aula em si vem da grade oficial (horarios).
import { pgTable, serial, text, integer, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { professoresTable } from "./professores";

export const STATUS_PRESENCA = ["presente", "falta", "atraso", "substituido"] as const;
export type StatusPresenca = (typeof STATUS_PRESENCA)[number];

export const presencasProfessoresTable = pgTable(
  "presencas_professores",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    turno: text("turno").notNull(),
    numeroAula: integer("numero_aula").notNull(),
    professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    // quem deu a aula no lugar (professor da escola) ou o nome digitado (de fora)
    substitutoId: integer("substituto_id").references(() => professoresTable.id, { onDelete: "set null" }),
    substitutoNome: text("substituto_nome"),
    observacao: text("observacao"),
    registradoPor: text("registrado_por"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    aulaUnica: uniqueIndex("presencas_professores_aula_uq").on(t.escolaId, t.data, t.turno, t.numeroAula, t.professorId),
    porEscolaData: index("presencas_professores_escola_data_idx").on(t.escolaId, t.data),
  }),
);

export type PresencaProfessor = typeof presencasProfessoresTable.$inferSelect;

// [PRESENCA-OBS-GERAL] (06/11/2026) Observacao geral do professor no dia e turno (ex.: atestado, saiu mais
// cedo), pedida pela dona no lugar da observacao por aula. A coluna observacao da tabela acima continua
// para as marcacoes antigas. Uma linha por professor + dia + turno; sem texto = sem linha.
export const presencasObservacoesTable = pgTable(
  "presencas_observacoes",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    turno: text("turno").notNull(),
    professorId: integer("professor_id").notNull().references(() => professoresTable.id, { onDelete: "cascade" }),
    observacao: text("observacao").notNull(),
    registradoPor: text("registrado_por"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    professorDia: uniqueIndex("presencas_observacoes_professor_uq").on(t.escolaId, t.data, t.turno, t.professorId),
  }),
);
