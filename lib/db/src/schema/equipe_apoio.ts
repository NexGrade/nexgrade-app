// [EQUIPE-APOIO] (12/11/2026) Pessoas que assinam o Ponto Diario mas nao dao aula de turma: pedagogos,
// PAEE, interpretes, PAC e Sala de Recursos (pedido do C.E. Romario Martins). Ficam FORA da tabela
// professores de proposito: assim nao entram no gerador de grade, no calculo de HA, no arquivo do RCO
// nem nas listas de substituto. Quem e professor e tambem faz PAEE continua so em professores (o PAEE
// ja sai nas aulas pela disponibilidade "(ocupado: PAEE)").
import { pgTable, text, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const FUNCOES_EQUIPE_APOIO = ["pedagogo", "paee", "interprete", "pac", "sala_recursos"] as const;
export type FuncaoEquipeApoio = (typeof FUNCOES_EQUIPE_APOIO)[number];
export const TURNOS_EQUIPE_APOIO = ["matutino", "vespertino", "noturno"] as const;
export type TurnoEquipeApoio = (typeof TURNOS_EQUIPE_APOIO)[number];
/** Um dia (0 = segunda ... 4 = sexta) e um turno em que a pessoa trabalha. */
export type ExpedienteEquipeApoio = { dia: number; turno: TurnoEquipeApoio };

export const equipeApoioTable = pgTable(
  "equipe_apoio",
  {
    id: serial("id").primaryKey(),
    escolaId: text("escola_id").notNull(),
    nome: text("nome").notNull(),
    funcao: text("funcao").notNull(), // FuncaoEquipeApoio
    // complemento livre que sai junto da funcao na folha (ex.: a turma que o interprete acompanha)
    complemento: text("complemento"),
    expediente: jsonb("expediente").$type<ExpedienteEquipeApoio[]>().notNull().default([]),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    porEscola: index("equipe_apoio_escola_idx").on(t.escolaId),
  }),
);

export type EquipeApoio = typeof equipeApoioTable.$inferSelect;
