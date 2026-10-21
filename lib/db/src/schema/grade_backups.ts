import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

// [BACKUP-GRADE] (21/10/2026) Cópia da grade OFICIAL da escola (aulas + HA)
// guardada automaticamente antes de cada promoção, para o botão
// "Voltar à grade anterior". Guarda as últimas cópias de cada escola.
export const gradeBackupsTable = pgTable("grade_backups", {
  id: serial("id").primaryKey(),
  escolaId: text("escola_id").notNull(),
  motivo: text("motivo").notNull(), // ex.: 'Antes de promover "MELHORIA-matutino-..."'
  qtdAulas: integer("qtd_aulas").notNull().default(0),
  qtdHa: integer("qtd_ha").notNull().default(0),
  dados: jsonb("dados").notNull(), // { horarios: [...], ha: [...] }
  usuarioNome: text("usuario_nome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("grade_backups_escola_idx").on(t.escolaId, t.createdAt)]);

export type GradeBackup = typeof gradeBackupsTable.$inferSelect;
