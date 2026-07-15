import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matrizesCurricularesTable } from "./cursos";
import { professoresTable } from "./professores";

export const turmasTable = pgTable("turmas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  serie: text("serie").notNull(),
  turno: text("turno").notNull().default("matutino"),
  anoLetivo: integer("ano_letivo").notNull(),
  // RF-TUR-01/02: vínculo opcional com a Matriz Curricular (ver
  // cursos.ts) que define a carga horária esperada por disciplina desta
  // turma. Nulo enquanto a turma não estiver associada a uma matriz.
  matrizCurricularId: integer("matriz_curricular_id")
    .references(() => matrizesCurricularesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const turmaDisciplinasTable = pgTable("turma_disciplinas", {
  id: serial("id").primaryKey(),
  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaId: integer("disciplina_id").notNull(),
  // [NOVO] Professor específico que dá ESSA disciplina NESSA turma —
  // necessário porque a mesma disciplina (ex: Matemática) costuma ter
  // professores diferentes em turmas diferentes; professor_disciplinas
  // (genérico, professor+disciplina) não é suficiente pra desambiguar
  // isso. Nulo enquanto a turma não tiver um professor definido pra essa
  // disciplina (ex: antes da distribuição de aulas ser fechada).
  professorId: integer("professor_id").references(() => professoresTable.id, { onDelete: "set null" }),
  // RF-TUR-02: quando a disciplina veio de uma Matriz Curricular
  // aplicada (ver rota POST /turmas/:id/aplicar-matriz), este campo
  // guarda a carga horária semanal daquela série específica — que tem
  // prioridade sobre `disciplinasTable.cargaSemanal` (global) na hora de
  // gerar horário (routes/horarios.ts) e detectar conflitos
  // (routes/conflitos.ts). Nulo quando a disciplina foi vinculada
  // manualmente (fluxo antigo, sem matriz) — nesse caso o valor global
  // continua sendo usado, sem quebrar turmas já existentes.
  cargaHorariaSemanalOverride: integer("carga_horaria_semanal_override"),
  // RNF-SEED-03: limite de aulas consecutivas dessa disciplina, nessa
  // turma, no mesmo dia ("aulas geminadas" / Max_Aulas_Dia). Nulo = usa
  // o padrão geral definido em configuracoes (chave
  // "seed_pr.max_aulas_geminadas_padrao"). Ver Resolução SEED n.º
  // 7.200/2025 e o comunicado interno da escola sobre aulas geminadas.
  maxAulasConsecutivasDia: integer("max_aulas_consecutivas_dia"),
  // RNF-SEED-04: quando preenchido, agrupa esta disciplina com as
  // mesmas linhas de outras turmas que tenham o MESMO valor aqui — o
  // gerador de horário deve colocá-las sempre no mesmo dia/aula
  // (uso típico: Itinerário Formativo de Aprofundamento cursado junto
  // por "1ª Série A" e "1ª Série B"). Recurso oferecido como boa
  // prática comum do Novo Ensino Médio — não é uma trava obrigatória
  // baseada em artigo de resolução confirmado; ative por opção da
  // escola quando fizer sentido para o itinerário em questão.
  grupoCompartilhadoId: text("grupo_compartilhado_id"),
});

export const insertTurmaSchema = createInsertSchema(turmasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTurma = z.infer<typeof insertTurmaSchema>;
export type Turma = typeof turmasTable.$inferSelect;
