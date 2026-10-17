import { boolean, date, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { recursosTable } from "./recursos";
import { salasTable } from "./salas";

// [BLOQUEIOS] (17/10/2026) Sala ou equipamento indisponivel por um periodo (manutencao, limpeza, outro motivo).
// Feito pelo gestor de reservas, coordenacao, direcao ou secretaria. Enquanto o bloqueio estiver ativo:
// - sala: nao aceita reserva nas datas/aulas bloqueadas;
// - equipamento (tablets): "quantidade" unidades saem do total disponivel nas datas/aulas bloqueadas.
// Remover um bloqueio e "desativar" (ativo = false): fica o registro de quem bloqueou e por que.
export const bloqueiosTable = pgTable(
  "bloqueios",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    // "sala" | "recurso"
    alvoTipo: text("alvo_tipo").notNull(),
    salaId: integer("sala_id").references(() => salasTable.id, { onDelete: "cascade" }),
    recursoId: integer("recurso_id").references(() => recursosTable.id, { onDelete: "cascade" }),
    // so para equipamento: quantas unidades ficam indisponiveis (sala e sempre bloqueada inteira)
    quantidade: integer("quantidade"),
    dataInicio: date("data_inicio", { mode: "string" }).notNull(),
    dataFim: date("data_fim", { mode: "string" }).notNull(),
    // nulo = todos os periodos
    turno: text("turno"),
    // aulas bloqueadas; nulo ou vazio = dia inteiro (todas as aulas)
    numerosAula: integer("numeros_aula").array(),
    // "manutencao" | "limpeza" | "outro"
    motivo: text("motivo").notNull(),
    descricao: text("descricao"),
    criadoPor: text("criado_por").notNull().default("Sistema"),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    periodoIdx: index("bloqueios_escola_periodo_idx").on(table.escolaId, table.dataInicio, table.dataFim),
  }),
);

export type Bloqueio = typeof bloqueiosTable.$inferSelect;
