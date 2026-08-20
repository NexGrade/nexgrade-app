import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { composicaoCurricularEnum } from "./enums";
export const disciplinasTable = pgTable("disciplinas", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull().default("escola_default"),
  nome: text("nome").notNull(),
  // [NOVO] Sigla curta (ex.: "MAT", "L.POR", "ED.FIS"), usada nas
  // grades PDF compactas (ver lib/pdf-grade.ts) — formato oficial já
  // praticado pela escola nos exports do Urânia, com várias turmas por
  // página. Nula até ser preenchida manualmente ou populada em lote.
  sigla: text("sigla"),
  cargaSemanal: integer("carga_semanal").notNull().default(2),
  cor: text("cor").notNull().default("#6366f1"),
  // Código SAE oficial (origem regulatória — identificador público do
  // Estado do Paraná). Opcional: nem toda escola/disciplina tem um
  // vínculo já mapeado. RF-DISC-01/02.
  codigoSae: text("codigo_sae"),
  // RNF-SEED-02: quando preenchido, toda aula dessa disciplina deve
  // acontecer numa sala com esse mesmo `tipo` (ver salasTable.tipo —
  // ex. "laboratorio", "quadra"). Nulo = sem restrição de espaço.
  // Usado para travar automaticamente Pensamento Computacional/cursos
  // técnicos no laboratório e Educação Física na quadra.
  tipoSalaExigido: text("tipo_sala_exigido"),
  // [NOVO] RF-DISC-03: categoria curricular fixa/padrão desta
  // disciplina (BNC/PD/FGB/PFO/IFA/IF/IFP/APF), usada pra filtrar a
  // lista de disciplinas na hora de montar uma Grade Curricular — ao
  // escolher a categoria primeiro, só aparecem disciplinas com esse
  // vínculo. Nula = disciplina "flexível", sem categoria fixa, elegível
  // pra qualquer categoria ao montar a matriz.
  categoriaCurricularPadrao: composicaoCurricularEnum("categoria_curricular_padrao"),
  // [NOVO] Disciplinas do tipo PAEE (Atendimento Educacional
  // Especializado) e similares nao tem vinculo com turma -- o
  // professor da essa "aula" pra registrar carga horaria, mas nao
  // existe uma turma especifica associada. Quando true, o campo
  // turmaId em horariosTable fica opcional pra essa disciplina (a
  // interface tambem esconde o seletor de turma ao criar/editar).
  semTurma: boolean("sem_turma").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export const insertDisciplinaSchema = createInsertSchema(disciplinasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDisciplina = z.infer<typeof insertDisciplinaSchema>;
export type Disciplina = typeof disciplinasTable.$inferSelect;
