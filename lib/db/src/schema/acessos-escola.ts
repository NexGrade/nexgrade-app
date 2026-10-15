// [ACESSOS-ESCOLA] (15/10/2026) Quem acessa cada escola e com qual cargo.
// O Clerk passa a cuidar so do login (quem e a pessoa); escola e cargo ficam aqui,
// sem o limite de membros por organizacao do plano gratuito do Clerk.
// Professor NAO entra nesta tabela: o acesso dele vem de professores.email.
// Plano completo: claude/plano-acessos-escola.md (projeto NexGrade).
import { pgTable, text, serial, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const CARGOS_ACESSO = ["direcao", "coordenacao", "secretaria", "reservas"] as const;
export type CargoAcesso = (typeof CARGOS_ACESSO)[number];

export const acessosEscolaTable = pgTable(
  "acessos_escola",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    // sempre minusculo e sem espacos (o login compara por aqui)
    email: text("email").notNull(),
    nome: text("nome"),
    cargo: text("cargo").notNull(),
    // id do usuario no Clerk; preenchido no primeiro login
    userId: text("user_id"),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: text("criado_por"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
  },
  (t) => ({
    escolaEmailUnico: uniqueIndex("acessos_escola_escola_email_uq").on(t.escolaId, t.email),
    porEmail: index("acessos_escola_email_idx").on(t.email),
    porUsuario: index("acessos_escola_user_idx").on(t.userId),
  }),
);

export type AcessoEscola = typeof acessosEscolaTable.$inferSelect;
