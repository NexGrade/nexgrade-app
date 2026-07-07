import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { escolasRef } from "./referencias-existentes";
import { composicaoCurricularEnum, turnoEnum } from "./enums";
import { disciplinas } from "./disciplinas";

/** Curso oferecido pela escola (ex.: "TEC EM ADMINISTRACAO - ET GN"). */
export const cursos = pgTable("cursos", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id")
    .notNull()
    .references(() => escolasRef.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 255 }).notNull(),
  /** Código do curso no SERE, quando existir (ex.: 2511, 1624). */
  codigoCursoSere: varchar("codigo_curso_sere", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Matriz curricular importada/associada ao curso + período letivo + turno.
 *
 * [ALTA] codigo_matriz_sere — rastreabilidade e conferência cruzada direta
 * com o RCO (ex.: 2957644, 3014494).
 */
export const matrizesCurriculares = pgTable(
  "matrizes_curriculares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolasRef.id, { onDelete: "cascade" }),
    cursoId: uuid("curso_id")
      .notNull()
      .references(() => cursos.id, { onDelete: "cascade" }),
    /** Ex.: "2026-1" */
    periodoLetivo: varchar("periodo_letivo", { length: 20 }).notNull(),
    turno: turnoEnum("turno").notNull(),
    /** Código único da matriz no SERE — chave de conferência com o RCO. */
    codigoMatrizSere: varchar("codigo_matriz_sere", { length: 30 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    escolaCodigoMatrizUnique: uniqueIndex(
      "matrizes_escola_codigo_matriz_sere_unique"
    ).on(table.escolaId, table.codigoMatrizSere),
  })
);

/**
 * Organização da matriz por série/ano (ex.: "3ª série", "8º Ano"), cada
 * uma com seu próprio total de carga horária semanal — espelha a aba
 * "Organização da matriz" do SERE.
 */
export const matrizSeries = pgTable(
  "matriz_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matrizCurricularId: uuid("matriz_curricular_id")
      .notNull()
      .references(() => matrizesCurriculares.id, { onDelete: "cascade" }),
    /** Ex.: "1ª série", "3ª Série", "8º Ano". */
    nomeSerie: varchar("nome_serie", { length: 50 }).notNull(),
    /** Soma de carga horária semanal da série — validação cruzada. */
    cargaHorariaTotal: integer("carga_horaria_total").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    matrizSerieUnique: uniqueIndex("matriz_series_matriz_nome_unique").on(
      table.matrizCurricularId,
      table.nomeSerie
    ),
  })
);

/**
 * Item de disciplina dentro de uma série da matriz — a tabela mais crítica
 * do schema. Espelha linha a linha a tabela "Disciplinas da Série" do SERE.
 *
 * [ALTA] composicaoCurricular — enum fechado (ver enums.ts), nunca texto livre.
 * [ALTA] obrigatoriedade — coluna O (*) do SERE.
 * [MÉDIA] grupoDisciplina / padraoDoGrupo — agrupamento de eletivas
 * (ex.: "Língua Estrangeira Moderna" agrupando Espanhol/outras opções).
 */
export const matrizDisciplinas = pgTable(
  "matriz_disciplinas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matrizSerieId: uuid("matriz_serie_id")
      .notNull()
      .references(() => matrizSeries.id, { onDelete: "cascade" }),
    disciplinaId: uuid("disciplina_id")
      .notNull()
      .references(() => disciplinas.id, { onDelete: "restrict" }),
    /** Nº da linha na tabela do SERE — mantém a ordem original. */
    ordem: integer("ordem"),
    composicaoCurricular: composicaoCurricularEnum("composicao_curricular").notNull(),
    cargaHorariaSemanal: integer("carga_horaria_semanal").notNull(),
    /** Ex.: "Língua Estrangeira Moderna" — null quando a disciplina não é eletiva. */
    grupoDisciplina: varchar("grupo_disciplina", { length: 100 }),
    /** Indica qual disciplina do grupo é a opção padrão (S/N no SERE). */
    padraoDoGrupo: boolean("padrao_do_grupo").notNull().default(false),
    /** Coluna "O (*)" do SERE — S = obrigatória. */
    obrigatoriedade: boolean("obrigatoriedade").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    serieDisciplinaUnique: uniqueIndex("matriz_disc_serie_disciplina_unique").on(
      table.matrizSerieId,
      table.disciplinaId
    ),
    grupoIdx: index("matriz_disc_grupo_idx").on(
      table.matrizSerieId,
      table.grupoDisciplina
    ),
  })
);
