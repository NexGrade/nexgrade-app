import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { composicaoCurricularEnum } from "./enums";

// [NOVO] Catálogo mestre de disciplinas — diferente de disciplinasTable
// (escola.ts), esta tabela NÃO tem escolaId: é compartilhada entre
// todas as escolas da plataforma, funcionando como referência oficial
// (nomenclatura SEED-PR/código SAE já validados). Uma escola nova
// escolhe quais disciplinas deste catálogo usa (ver rota
// POST /disciplinas-catalogo/adicionar-selecionadas em
// routes/disciplinas-catalogo.ts), o que cria as linhas correspondentes
// em disciplinasTable já com nome/SAE/categoria corretos — evita digitar
// tudo de novo, escola por escola.
//
// Populada inicialmente a partir da limpeza de dados feita na escola
// piloto (ver migração de seed correspondente): ~317 disciplinas com
// nomes corrigidos via Instrução Normativa 001/2026 (DEDUC/DPGE/SEED) e
// código SAE oficial confirmado.
export const disciplinasCatalogoTable = pgTable("disciplinas_catalogo", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  codigoSae: text("codigo_sae"),
  categoriaCurricularPadrao: composicaoCurricularEnum("categoria_curricular_padrao"),
  // Sugestão de carga semanal e sala exigida — a escola pode ajustar
  // depois de adicionar à sua própria lista (disciplinasTable), isto é
  // só o valor inicial copiado.
  cargaSemanalSugerida: integer("carga_semanal_sugerida").notNull().default(2),
  tipoSalaExigido: text("tipo_sala_exigido"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDisciplinaCatalogoSchema = createInsertSchema(disciplinasCatalogoTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDisciplinaCatalogo = z.infer<typeof insertDisciplinaCatalogoSchema>;
export type DisciplinaCatalogo = typeof disciplinasCatalogoTable.$inferSelect;
