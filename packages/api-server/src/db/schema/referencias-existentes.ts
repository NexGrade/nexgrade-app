/**
 * ATENÇÃO — este arquivo é um STUB, não um schema real.
 *
 * As tabelas abaixo (escolas, professores) provavelmente já existem no
 * projeto NexGrade, dado o isolamento multi-tenant já implementado
 * (Clerk Organizations + escolaId em todas as tabelas). Os schemas novos
 * deste pacote (disciplinas.ts, matriz-curricular.ts, turmas.ts,
 * horarios.ts, restricoes.ts, motor-config.ts) referenciam `escolas.id`
 * e `professores.id` por FK.
 *
 * Ao integrar: apague este arquivo e troque os imports de
 * `escolasRef` / `professoresRef` pelas tabelas reais do projeto.
 * Os dois únicos requisitos de compatibilidade são:
 *   - escolas.id       -> uuid, primary key
 *   - professores.id   -> uuid, primary key
 *   - professores.escolaId -> uuid, FK para escolas.id
 *
 * Se a tabela de professores real ainda não tiver `abreviatura`,
 * adicionar via migration (ver item MÉDIA "Abreviação de professor e
 * disciplina" no plano de implementação).
 */
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const escolasRef = pgTable("escolas", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: varchar("clerk_org_id", { length: 191 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  codigoInep: varchar("codigo_inep", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const professoresRef = pgTable("professores", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id")
    .notNull()
    .references(() => escolasRef.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 255 }).notNull(),
  /** MÉDIA — confirmado nas grades reais: célula da grelha exige nome curto. */
  abreviatura: varchar("abreviatura", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
