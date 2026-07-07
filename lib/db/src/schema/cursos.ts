import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// RF-CUR-01 a RF-CUR-05: Curso, Matriz Curricular e Itens da Matriz.
//
// Modela a estrutura curricular oficial (série/ano -> disciplinas com
// carga horária e categoria) de forma independente de qualquer sistema
// de terceiros. "categoriaCurricular" usa nomenclatura própria do
// NexGrade (ver comentário abaixo) — mapeável para a "Composição
// Curricular" do SERE (dado público/regulatório), mas não copiada dela.
// "codigoSae" em disciplinas.ts é o único campo de origem regulatória
// direta (Código SAE é identificador público do Estado do Paraná).

export const cursosTable = pgTable("cursos", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  codigoCurso: text("codigo_curso"),
  // Nível do curso: fundamental | medio | tecnico | normal_magisterio
  nivel: text("nivel").notNull().default("fundamental"),
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
  // Ex.: "6º Ano", "1ª Série", "3ª Série".
  serieAno: text("serie_ano").notNull(),
  // RF-CUR-05: deve bater com a soma de cargaHorariaSemanal dos itens.
  cargaHorariaSemanalTotal: integer("carga_horaria_semanal_total").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itensMatrizTable = pgTable("itens_matriz", {
  id: serial("id").primaryKey(),
  matrizCurricularId: integer("matriz_curricular_id")
    .notNull()
    .references(() => matrizesCurricularesTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull(),
  // Categoria curricular, nomenclatura própria do NexGrade:
  // base_nacional_comum | parte_diversificada | formacao_geral_basica |
  // itinerario_formativo | itinerario_profissionalizante |
  // aprofundamento_pratica | parte_flexivel
  categoriaCurricular: text("categoria_curricular").notNull().default("base_nacional_comum"),
  cargaHorariaSemanal: integer("carga_horaria_semanal").notNull().default(2),
  // RF-CUR-03: nome do grupo de opções (ex. "Língua Estrangeira Moderna").
  // Nulo quando o item não pertence a um grupo de escolha.
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
