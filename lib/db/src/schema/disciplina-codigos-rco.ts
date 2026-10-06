import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

// [CODIGOS-RCO] (06/10/2026) Tabela PADRAO (vale para qualquer escola): codigo SAE da
// disciplina -> "Codigo Externo" que o RCO aceita no arquivo de importacao da grade
// (campo CODDISC). Nao e o SAE nem o No da matriz; vem do SERE/Urania.
export const codigosRcoDisciplinaTable = pgTable("codigos_rco_disciplina", {
  codigoSae: integer("codigo_sae").primaryKey(),
  codigoExterno: integer("codigo_externo").notNull(),
  nomeRco: text("nome_rco"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CodigoRcoDisciplina = typeof codigosRcoDisciplinaTable.$inferSelect;
