import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasRef } from "./referencias-existentes";

/**
 * Cadastro de disciplinas, agora vinculado ao Código SAE oficial do Estado.
 *
 * [ALTA] codigo_sae — permite exportação 1:1 para o RCO sem mapeamento
 * manual. Esse é o campo que elimina o principal ponto de falha da
 * concorrência (Urânia depende de cadastro manual sem esse vínculo).
 *
 * [MÉDIA] abreviatura — confirmado nas grades reais (ex.: ED.FIS, L.POR,
 * REDLEI): a célula da grelha de horário precisa do nome curto para caber
 * no layout.
 */
export const disciplinas = pgTable(
  "disciplinas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolasRef.id, { onDelete: "cascade" }),
    nome: varchar("nome", { length: 255 }).notNull(),
    /** Código oficial da disciplina no Estado (ex.: Arte = 704, Química = 801). */
    codigoSae: varchar("codigo_sae", { length: 20 }).notNull(),
    /** Nome curto para caber na grelha de horário (ex.: "ED.FIS", "L.POR"). */
    abreviatura: varchar("abreviatura", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Um código SAE não pode se repetir dentro da mesma escola.
    escolaCodigoSaeUnique: uniqueIndex("disciplinas_escola_codigo_sae_unique").on(
      table.escolaId,
      table.codigoSae
    ),
  })
);
