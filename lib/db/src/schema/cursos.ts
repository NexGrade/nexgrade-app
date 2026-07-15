import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { composicaoCurricularEnum, eixoTecnologicoEnum, formaOfertaEnum } from "./enums";

// RF-CUR-01 a RF-CUR-05: Curso, Matriz Curricular e Itens da Matriz.
export const cursosTable = pgTable("cursos", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  codigoCurso: text("codigo_curso"),
  nivel: text("nivel").notNull().default("fundamental"),
  eixoTecnologico: eixoTecnologicoEnum("eixo_tecnologico"),
  // [NOVO] Ver enums.ts / formaOfertaEnum — distingue "integrada" de
  // "concomitante_intercomplementar" quando dois cursos técnicos têm o
  // mesmo nome mas são ofertas administrativas diferentes.
  formaOferta: formaOfertaEnum("forma_oferta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const matrizesCurricularesTable = pgTable("matrizes_curriculares", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  cursoId: integer("curso_id")
    .notNull()
    .references(() => cursosTable.id, { onDelete: "cascade" }),
  serieAno: text("serie_ano").notNull(),
  cargaHorariaSemanalTotal: integer("carga_horaria_semanal_total").notNull().default(0),
  // Código único de matriz atribuído pelo Estado (SERE/SAE) — identificador
  // oficial que a SEED-PR usa pra essa matriz curricular específica.
  // Opcional: só existe depois que a escola registra a matriz no sistema
  // do Estado; nulo enquanto isso não acontece.
  codigoMatrizSere: text("codigo_matriz_sere"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itensMatrizTable = pgTable("itens_matriz", {
  id: serial("id").primaryKey(),
  matrizCurricularId: integer("matriz_curricular_id")
    .notNull()
    .references(() => matrizesCurricularesTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull(),
  categoriaCurricular: composicaoCurricularEnum("categoria_curricular").notNull().default("BNC"),
  cargaHorariaSemanal: integer("carga_horaria_semanal").notNull().default(2),
  grupoDisciplina: text("grupo_disciplina"),
  ehPadraoDoGrupo: boolean("eh_padrao_do_grupo").notNull().default(false),
  obrigatoria: boolean("obrigatoria").notNull().default(true),
});

export const insertCursoSchema = createInsertSchema(cursosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCurso = z.infer<typeof insertCursoSchema>;
export type Curso = typeof cursosTable.$inferSelect;

export const insertMatrizCurricularSchema = createInsertSchema(matrizesCurricularesTable).omit({ id: true, createdAt: true });
export type InsertMatrizCurricular = z.infer<typeof insertMatrizCurricularSchema>;
export type MatrizCurricular = typeof matrizesCurricularesTable.$inferSelect;

export const insertItemMatrizSchema = createInsertSchema(itensMatrizTable).omit({ id: true });
export type InsertItemMatriz = z.infer<typeof insertItemMatrizSchema>;
export type ItemMatriz = typeof itensMatrizTable.$inferSelect;
